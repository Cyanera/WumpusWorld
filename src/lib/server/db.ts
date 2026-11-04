import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, any>;
export type Where = Record<string, unknown>;
export interface ListOpts { order?: string; desc?: boolean; limit?: number }
/** Tiny table abstraction so the same server logic runs on Supabase or on an in-memory store (dev/tests). */
export interface DB {
  insert(table: string, row: Row): Promise<Row>;
  get(table: string, id: string, idCol?: string): Promise<Row | null>;
  find(table: string, where: Where): Promise<Row | null>;
  list(table: string, where?: Where, opts?: ListOpts): Promise<Row[]>;
  update(table: string, id: string, patch: Row, opts?: { idCol?: string; expectVersion?: number }): Promise<boolean>;
  upsert(table: string, row: Row, onConflict: string): Promise<void>;
  delete(table: string, where: Where): Promise<void>;
}

const PK: Record<string, string> = { hidden_worlds: 'game_id', knowledge_states: 'game_id', assessment_results: 'game_id' };
const pk = (t: string) => PK[t] ?? 'id';

export class MemoryDB implements DB {
  tables = new Map<string, Row[]>();
  private t(name: string) { if (!this.tables.has(name)) this.tables.set(name, []); return this.tables.get(name)!; }
  private match(r: Row, w: Where) { return Object.entries(w).every(([k, v]) => r[k] === v); }
  async insert(t: string, row: Row) {
    const rows = this.t(t);
    const uniq: Record<string, string[]> = { game_events: ['game_id', 'seq', 'kind'], inference_attempts: ['game_id', 'checkpoint_id'], inference_records: ['game_id', 'record_id'], classroom_sessions: ['code'] };
    const u = uniq[t];
    if (u && rows.some((r) => u.every((c) => r[c] === row[c]))) throw new Error(`duplicate key in ${t}`);
    const copy = structuredClone({ created_at: new Date().toISOString(), ...row });
    rows.push(copy);
    return structuredClone(copy);
  }
  async get(t: string, id: string, idCol = pk(t)) { const r = this.t(t).find((x) => x[idCol] === id); return r ? structuredClone(r) : null; }
  async find(t: string, w: Where) { const r = this.t(t).find((x) => this.match(x, w)); return r ? structuredClone(r) : null; }
  async list(t: string, w: Where = {}, o: ListOpts = {}) {
    let rows = this.t(t).filter((r) => this.match(r, w));
    if (o.order) rows = rows.slice().sort((a, b) => (a[o.order!] > b[o.order!] ? 1 : a[o.order!] < b[o.order!] ? -1 : 0) * (o.desc ? -1 : 1));
    if (o.limit) rows = rows.slice(0, o.limit);
    return structuredClone(rows);
  }
  async update(t: string, id: string, patch: Row, o: { idCol?: string; expectVersion?: number } = {}) {
    const r = this.t(t).find((x) => x[o.idCol ?? pk(t)] === id);
    if (!r) return false;
    if (o.expectVersion !== undefined && r.version !== o.expectVersion) return false;
    Object.assign(r, structuredClone(patch));
    return true;
  }
  async upsert(t: string, row: Row, onConflict: string) {
    const r = this.t(t).find((x) => x[onConflict] === row[onConflict]);
    if (r) Object.assign(r, structuredClone(row)); else this.t(t).push(structuredClone(row));
  }
  async delete(t: string, w: Where) { this.tables.set(t, this.t(t).filter((r) => !this.match(r, w))); }
}

export class SupabaseDB implements DB {
  constructor(private sb: SupabaseClient) {}
  private apply(q: any, w: Where) { for (const [k, v] of Object.entries(w)) q = q.eq(k, v as any); return q; }
  async insert(t: string, row: Row) {
    const { data, error } = await this.sb.from(t).insert(row).select().single();
    if (error) throw new Error(`${t}.insert: ${error.message}`);
    return data;
  }
  async get(t: string, id: string, idCol = pk(t)) {
    const { data, error } = await this.sb.from(t).select('*').eq(idCol, id).maybeSingle();
    if (error) throw new Error(`${t}.get: ${error.message}`);
    return data;
  }
  async find(t: string, w: Where) {
    const { data, error } = await this.apply(this.sb.from(t).select('*'), w).limit(1).maybeSingle();
    if (error) throw new Error(`${t}.find: ${error.message}`);
    return data;
  }
  async list(t: string, w: Where = {}, o: ListOpts = {}) {
    let q = this.apply(this.sb.from(t).select('*'), w);
    if (o.order) q = q.order(o.order, { ascending: !o.desc });
    q = q.limit(o.limit ?? 5000);
    const { data, error } = await q;
    if (error) throw new Error(`${t}.list: ${error.message}`);
    return data ?? [];
  }
  async update(t: string, id: string, patch: Row, o: { idCol?: string; expectVersion?: number } = {}) {
    let q = this.sb.from(t).update(patch).eq(o.idCol ?? pk(t), id);
    if (o.expectVersion !== undefined) q = q.eq('version', o.expectVersion);
    const { data, error } = await q.select();
    if (error) throw new Error(`${t}.update: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
  async upsert(t: string, row: Row, onConflict: string) {
    const { error } = await this.sb.from(t).upsert(row, { onConflict });
    if (error) throw new Error(`${t}.upsert: ${error.message}`);
  }
  async delete(t: string, w: Where) {
    const { error } = await this.apply(this.sb.from(t).delete(), w);
    if (error) throw new Error(`${t}.delete: ${error.message}`);
  }
}

export class ConfigError extends Error {}
let singleton: DB | null = null;
export function getDB(): DB {
  if (singleton) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) singleton = new SupabaseDB(createClient(url, key, { auth: { persistSession: false }, global: { fetch: (u: any, o: any) => fetch(u, { ...o, cache: 'no-store' }) } }));
  else {
    // In production a missing Supabase config must be a loud error: the in-memory store is per serverless instance,
    // so students would randomly "lose" their session. Opt in explicitly (ALLOW_MEMORY_DB=1) for local demos only.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MEMORY_DB !== '1') {
      throw new ConfigError('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the Production environment, then redeploy.');
    }
    const g = globalThis as any;
    g.__wwMemDB ??= new MemoryDB();
    singleton = g.__wwMemDB;
  }
  return singleton!;
}
export function setDB(db: DB | null) { singleton = db; }
