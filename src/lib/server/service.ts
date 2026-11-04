import { randomUUID } from 'crypto';
import { ActionType, ACTIONS, Difficulty, Label, LABELS, Mode } from '@/lib/engine/types';
import {
  GameState, Output, applyAction, buildReport, engineKnowledge, isOver, newGame, studentView, submitCheckpoint,
} from '@/lib/engine/game';
import { InferenceRecord, compact } from '@/lib/engine/reasoner';
import { World } from '@/lib/engine/types';
import { DB, Row } from './db';
import { newToken, sha256, tokenMatches } from './auth';
import { broadcast } from './realtime';

export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
const fail = (status: number, code: string): never => { throw new HttpError(status, code); };

export interface SessionSettings { logic_enabled?: boolean; logic_view?: 'natural' | 'formal' | 'both'; revealed?: Record<string, boolean>; projected?: { gameId: string; recordId: string } | null }
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

// ------------------------------------------------------------------ sessions
export function effectiveStatus(s: Row, now = Date.now()): 'lobby' | 'active' | 'paused' | 'finished' {
  if (s.status === 'active' && s.ends_at && new Date(s.ends_at).getTime() <= now) return 'finished';
  return s.status;
}
export function sessionPublic(s: Row, now = Date.now()) {
  const status = effectiveStatus(s, now);
  const settings: SessionSettings = s.settings ?? {};
  let remainingSec = s.duration_minutes * 60;
  if (s.status === 'active' && s.ends_at) remainingSec = Math.max(0, Math.round((new Date(s.ends_at).getTime() - now) / 1000));
  else if (s.status === 'paused' && s.ends_at && s.paused_at) remainingSec = Math.max(0, Math.round((new Date(s.ends_at).getTime() - new Date(s.paused_at).getTime()) / 1000));
  else if (s.status === 'finished') remainingSec = 0;
  return {
    id: s.id, code: s.code, title: s.title, status, mode: s.mode as Mode, difficulty: s.difficulty as Difficulty, pits: s.pits,
    durationMinutes: s.duration_minutes, remainingSec, serverNow: now,
    logic: { enabled: settings.logic_enabled ?? true, view: settings.logic_view ?? 'both' }, settings,
  };
}

export async function ensureInstructor(db: DB, email: string): Promise<Row> {
  const e = email.trim().toLowerCase();
  return (await db.find('instructors', { email: e })) ?? db.insert('instructors', { id: randomUUID(), email: e });
}

export async function createSession(db: DB, instructorId: string, o: { title?: string; mode?: Mode; difficulty?: Difficulty; pits?: number; durationMinutes?: number }) {
  for (let i = 0; i < 8; i++) {
    try {
      const row = await db.insert('classroom_sessions', {
        id: randomUUID(), instructor_id: instructorId, code: makeCode(), title: (o.title || 'Wumpus World').slice(0, 80),
        status: 'lobby', mode: o.mode === 'challenge' ? 'challenge' : 'guided', difficulty: o.difficulty ?? 'normal',
        pits: Math.min(5, Math.max(1, o.pits ?? 2)), duration_minutes: Math.min(120, Math.max(1, o.durationMinutes ?? 20)),
        started_at: null, ends_at: null, paused_at: null, settings: { logic_enabled: true, logic_view: 'both', revealed: {} },
      });
      return row;
    } catch (e) { if (i === 7) throw e; }
  }
  throw new Error('unreachable');
}
export async function getSessionByCode(db: DB, code: string) {
  const s = await db.find('classroom_sessions', { code: code.trim().toUpperCase() });
  return s ?? fail(404, 'session_not_found');
}
export async function ownedSession(db: DB, instructorId: string, code: string) {
  const s = await getSessionByCode(db, code);
  if (s.instructor_id !== instructorId) fail(403, 'forbidden');
  return s;
}

export async function controlSession(db: DB, s: Row, action: 'start' | 'pause' | 'resume' | 'finish' | 'extend', minutes = 5) {
  const now = Date.now(); const patch: Row = {};
  const st = effectiveStatus(s, now);
  if (action === 'start' && st === 'lobby') Object.assign(patch, { status: 'active', started_at: new Date(now).toISOString(), ends_at: new Date(now + s.duration_minutes * 60_000).toISOString() });
  else if (action === 'pause' && st === 'active') Object.assign(patch, { status: 'paused', paused_at: new Date(now).toISOString() });
  else if (action === 'resume' && st === 'paused') {
    const shift = now - new Date(s.paused_at).getTime();
    Object.assign(patch, { status: 'active', paused_at: null, ends_at: new Date(new Date(s.ends_at).getTime() + shift).toISOString() });
  } else if (action === 'finish' && st !== 'finished') Object.assign(patch, { status: 'finished', ends_at: new Date(now).toISOString() });
  else if (action === 'extend' && s.ends_at) Object.assign(patch, { ends_at: new Date(Math.max(now, new Date(s.ends_at).getTime()) + minutes * 60_000).toISOString(), status: st === 'finished' ? 'active' : s.status });
  if (!Object.keys(patch).length) return s;
  await db.update('classroom_sessions', s.id, patch);
  const next = { ...s, ...patch };
  await broadcast(s.code, 'session', { status: effectiveStatus(next) });
  return next;
}
export async function updateSettings(db: DB, s: Row, patch: Partial<SessionSettings> & { mode?: Mode; difficulty?: Difficulty; pits?: number; title?: string; durationMinutes?: number }) {
  const settings: SessionSettings = { ...(s.settings ?? {}) };
  if (patch.logic_enabled !== undefined) settings.logic_enabled = !!patch.logic_enabled;
  if (patch.logic_view && ['natural', 'formal', 'both'].includes(patch.logic_view)) settings.logic_view = patch.logic_view;
  if (patch.revealed) settings.revealed = { ...(settings.revealed ?? {}), ...patch.revealed };
  if (patch.projected !== undefined) settings.projected = patch.projected;
  const row: Row = { settings };
  if (patch.mode && ['guided', 'challenge'].includes(patch.mode)) row.mode = patch.mode;
  if (patch.difficulty && ['easy', 'normal', 'hard'].includes(patch.difficulty)) row.difficulty = patch.difficulty;
  if (patch.pits) row.pits = Math.min(5, Math.max(1, patch.pits));
  if (patch.title) row.title = patch.title.slice(0, 80);
  await db.update('classroom_sessions', s.id, row);
  await broadcast(s.code, 'settings', {});
  return { ...s, ...row };
}

// ------------------------------------------------------------------ participants
export async function join(db: DB, code: string, name: string, existing?: { pid?: string; token?: string }) {
  const s = await getSessionByCode(db, code);
  if (existing?.pid && existing.token) {
    const p = await db.get('participants', existing.pid);
    if (p && p.session_id === s.id && tokenMatches(existing.token, p.token_hash)) return { participantId: p.id, token: existing.token, name: p.display_name, resumed: true };
  }
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
  if (clean.length < 1) fail(400, 'name_required');
  if (effectiveStatus(s) === 'finished') fail(409, 'session_finished');
  const all = await db.list('participants', { session_id: s.id });
  if (all.length >= 300) fail(409, 'session_full');
  let display = clean, n = 1;
  while (all.some((p) => p.display_name.toLowerCase() === display.toLowerCase())) display = `${clean} ${++n}`;
  const token = newToken();
  const p = await db.insert('participants', {
    id: randomUUID(), session_id: s.id, display_name: display, token_hash: sha256(token), last_seen: new Date().toISOString(),
    summary: emptySummary(),
  });
  await broadcast(s.code, 'join', { name: display });
  return { participantId: p.id, token, name: display, resumed: false };
}

export interface Summary {
  status: string; gameId: string | null; mode: string | null; x: number; y: number; progress: number; visited: number; score: number;
  hasGold: boolean; correct: number; incorrect: number; cellsCorrect: number; cellsRelevant: number; safeMoves: number; risky: number;
  deaths: number; goldFound: number; games: number; completed: number; outcome: string | null; percepts: number;
  agg: { cellsCorrect: number; cellsRelevant: number; risky: number; safe: number; deaths: number; gold: number; completed: number; correct: number; incorrect: number; games: number };
}
export function emptySummary(): Summary {
  return { status: 'waiting', gameId: null, mode: null, x: 1, y: 1, progress: 0, visited: 0, score: 0, hasGold: false, correct: 0, incorrect: 0, cellsCorrect: 0, cellsRelevant: 0, safeMoves: 0, risky: 0, deaths: 0, goldFound: 0, games: 0, completed: 0, outcome: null, percepts: 0, agg: { cellsCorrect: 0, cellsRelevant: 0, risky: 0, safe: 0, deaths: 0, gold: 0, completed: 0, correct: 0, incorrect: 0, games: 0 } };
}
function summarize(prev: Summary, state: GameState, ended: boolean, justEnded: boolean): Summary {
  const agg = { ...(prev.agg ?? emptySummary().agg) };
  const st = state.stats; const a = state.agent;
  if (justEnded) {
    agg.cellsCorrect += st.cellsCorrect; agg.cellsRelevant += st.cellsRelevant; agg.risky += st.riskyDecisions; agg.safe += st.safeDecisions;
    agg.correct += st.correctInferences; agg.incorrect += st.incorrectInferences;
    agg.deaths += a.outcome === 'dead' ? 1 : 0; agg.gold += a.hasGold ? 1 : 0; agg.completed += 1;
  }
  const live = ended ? { cellsCorrect: 0, cellsRelevant: 0, risky: 0, safe: 0, correct: 0, incorrect: 0 } : { cellsCorrect: st.cellsCorrect, cellsRelevant: st.cellsRelevant, risky: st.riskyDecisions, safe: st.safeDecisions, correct: st.correctInferences, incorrect: st.incorrectInferences };
  const visited = state.obs.length;
  const progress = ended && a.outcome !== 'playing' && a.outcome !== 'dead' ? (a.hasGold && a.outcome === 'won' ? 100 : Math.round(visited / 16 * 50)) : Math.min(100, Math.round(visited / 16 * 50 + (a.hasGold ? 25 : 0)));
  return {
    status: a.outcome, gameId: state.id, mode: state.mode, x: a.x, y: a.y, progress, visited, score: a.score, hasGold: a.hasGold,
    correct: agg.correct + live.correct, incorrect: agg.incorrect + live.incorrect,
    cellsCorrect: agg.cellsCorrect + live.cellsCorrect, cellsRelevant: agg.cellsRelevant + live.cellsRelevant,
    safeMoves: agg.safe + live.safe, risky: agg.risky + live.risky, deaths: agg.deaths, goldFound: agg.gold + (!ended && a.hasGold ? 1 : 0),
    games: agg.games + (prev.gameId && prev.gameId === state.id ? 0 : 0), completed: agg.completed, outcome: a.outcome, percepts: st.perceptsEncountered, agg,
  } as Summary;
}

async function auth(db: DB, pid: string, token: string | null | undefined) {
  const p = await db.get('participants', pid);
  if (!p || !tokenMatches(token, p.token_hash)) return fail(401, 'unauthorized');
  const s = await db.get('classroom_sessions', p.session_id);
  if (!s) return fail(404, 'session_not_found');
  return { p, s };
}

async function latestGame(db: DB, pid: string) {
  const games = await db.list('game_instances', { participant_id: pid }, { order: 'started_at', desc: true, limit: 1 });
  return games[0] ?? null;
}
async function loadRecords(db: DB, gameId: string): Promise<InferenceRecord[]> {
  const rows = await db.list('inference_records', { game_id: gameId }, { order: 'step' });
  return rows.map((r) => r.record as InferenceRecord);
}
const loadWorld = async (db: DB, gameId: string): Promise<World | null> => (await db.get('hidden_worlds', gameId))?.world ?? null;

/** Time-limit / session-finish handling: mark a running game as timed out and reveal the world. */
async function finalizeTimeout(db: DB, p: Row, s: Row, g: Row) {
  const state: GameState = g.state;
  if (g.status !== 'playing' || state.agent.outcome !== 'playing') return g;
  const next: GameState = structuredClone(state);
  next.agent.outcome = 'timeout'; next.pending = []; next.seq += 1;
  next.reveal = { obsCount: next.obs.length, wumpusDead: !next.agent.wumpusAlive, recSeq: next.seq };
  await persistFinish(db, p, s, g, next);
  await db.insert('game_events', { id: randomUUID(), game_id: g.id, session_id: s.id, seq: next.seq, kind: 'end', payload: { kind: 'end', seq: next.seq, agent: { ...next.agent }, percepts: next.percepts, truth: compact(engineKnowledge(next)), truthWumpusDead: !next.agent.wumpusAlive, recordIds: [] } });
  return { ...g, state: next, status: 'timeout' };
}
async function persistFinish(db: DB, p: Row, s: Row, g: Row, next: GameState) {
  const attempts = await db.list('inference_attempts', { game_id: g.id });
  const report = buildReport(next, attempts.map((a) => ({ category: a.category, correct: a.correct, misconceptions: a.misconceptions ?? [] })));
  await db.update('game_instances', g.id, { state: next, status: next.agent.outcome, score: next.agent.score, ended_at: new Date().toISOString(), version: g.version + 1 });
  await db.upsert('assessment_results', { game_id: g.id, session_id: s.id, participant_id: p.id, report }, 'game_id');
  await db.update('participants', p.id, { summary: summarize(p.summary, next, true, true) });
}

function studentPayload(s: Row, p: Row, g: Row | null, records: InferenceRecord[], world: World | null) {
  const sess = sessionPublic(s);
  const view = g ? studentView(g.state, records, world) : null;
  const logicAvailable = !!view && sess.logic.enabled && (view.checkpointsDone > 0 || view.over || view.records.length > 0 && view.mode === 'challenge' && view.stats.freeChecks > 0);
  return { session: { code: sess.code, title: sess.title, status: sess.status, mode: sess.mode, remainingSec: sess.remainingSec, serverNow: sess.serverNow, durationMinutes: sess.durationMinutes }, me: { id: p.id, name: p.display_name }, game: view, logic: { enabled: sess.logic.enabled, available: logicAvailable, view: sess.logic.view } };
}

export async function getStudentState(db: DB, pid: string, token: string | null | undefined) {
  const { p, s } = await auth(db, pid, token);
  let g = await latestGame(db, pid);
  if (g && effectiveStatus(s) === 'finished' && g.status === 'playing') g = await finalizeTimeout(db, p, s, g);
  // throttle last_seen writes
  if (Date.now() - new Date(p.last_seen).getTime() > 8000) await db.update('participants', pid, { last_seen: new Date().toISOString() });
  const records = g ? await loadRecords(db, g.id) : [];
  const world = g && g.state.agent.outcome !== 'playing' ? await loadWorld(db, g.id) : null;
  return studentPayload(s, p, g, records, world);
}

export async function startGame(db: DB, pid: string, token: string | null | undefined, wantMode?: Mode) {
  const { p, s } = await auth(db, pid, token);
  if (effectiveStatus(s) !== 'active') fail(409, 'session_not_active');
  const prev = await latestGame(db, pid);
  if (prev && prev.status === 'playing') return getStudentState(db, pid, token);
  const mode: Mode = wantMode === 'challenge' || wantMode === 'guided' ? wantMode : s.mode;
  const id = randomUUID();
  const { state, world, out } = newGame(id, mode, s.difficulty, s.pits);
  await db.insert('game_instances', { id, session_id: s.id, participant_id: pid, mode, status: 'playing', version: 0, state, score: 0, started_at: new Date().toISOString(), ended_at: null });
  await db.insert('hidden_worlds', { game_id: id, world });
  await writeOutput(db, s, p, id, out, state, true);
  const sum = emptySummary(); Object.assign(sum, p.summary, { gameId: id });
  await db.update('participants', pid, { last_seen: new Date().toISOString(), summary: summarize({ ...emptySummary(), ...p.summary }, state, false, false) });
  await broadcast(s.code, 'game', { pid });
  return getStudentState(db, pid, token);
}

async function writeOutput(db: DB, s: Row, p: Row, gameId: string, out: Output, state: GameState, isNew = false) {
  await db.upsert('knowledge_states', { game_id: gameId, seq: state.seq, knowledge: { cells: compact(engineKnowledge(state)), wumpusDead: !state.agent.wumpusAlive }, updated_at: new Date().toISOString() }, 'game_id');
  await db.insert('game_events', { id: randomUUID(), game_id: gameId, session_id: s.id, seq: out.event.seq, kind: out.event.kind, payload: out.event });
  for (const r of out.records) await db.insert('inference_records', { id: randomUUID(), game_id: gameId, session_id: s.id, record_id: r.id, step: r.step, kind: r.kind, record: r });
  if (out.attempt) {
    const a = out.attempt;
    await db.insert('inference_attempts', { id: a.id, game_id: gameId, session_id: s.id, participant_id: p.id, checkpoint_id: a.checkpointId, kind: a.kind, category: a.category, step: a.step, correct: a.correct, cells_correct: a.cellsCorrect, cells_relevant: a.cellsRelevant, misconceptions: a.misconceptions, answer: a.answer, evaluation: a.evaluation ?? null });
  }
}

type Mutator = (g: Row, world: World) => Output | { error: string };

async function mutate(db: DB, pid: string, token: string | null | undefined, opId: string | undefined, fn: Mutator) {
  const { p, s } = await auth(db, pid, token);
  for (let attempt = 0; attempt < 3; attempt++) {
    let g = await latestGame(db, pid);
    if (!g) return fail(404, 'no_game');
    if (g.state.lastOpId && opId && g.state.lastOpId === opId) return getStudentState(db, pid, token); // duplicate delivery
    if (effectiveStatus(s) === 'finished') { await finalizeTimeout(db, p, s, g); return fail(409, 'session_finished'); }
    if (effectiveStatus(s) !== 'active') fail(409, 'session_not_active');
    const world = await loadWorld(db, g.id);
    if (!world) return fail(500, 'world_missing');
    const res = fn(g, world);
    if ('error' in res) return fail(res.error === 'game_over' ? 409 : 409, res.error);
    const state = res.state; if (opId) state.lastOpId = opId;
    const over = isOver(state);
    const ok = await db.update('game_instances', g.id, { state, version: g.version + 1, score: state.agent.score, status: over ? state.agent.outcome : 'playing', ended_at: over ? new Date().toISOString() : null }, { expectVersion: g.version });
    if (!ok) continue; // concurrent write: reload and retry
    await writeOutput(db, s, p, g.id, res, state);
    if (over) {
      const attempts = await db.list('inference_attempts', { game_id: g.id });
      const report = buildReport(state, attempts.map((a) => ({ category: a.category, correct: a.correct, misconceptions: a.misconceptions ?? [] })));
      await db.upsert('assessment_results', { game_id: g.id, session_id: s.id, participant_id: p.id, report }, 'game_id');
    }
    await db.update('participants', pid, { last_seen: new Date().toISOString(), summary: summarize({ ...emptySummary(), ...p.summary }, state, over, over && !isOver(g.state)) });
    await broadcast(s.code, over ? 'end' : 'progress', { pid });
    return getStudentState(db, pid, token);
  }
  return fail(409, 'conflict');
}

export async function doAction(db: DB, pid: string, token: string | null | undefined, action: string, opId?: string) {
  if (!ACTIONS.includes(action as ActionType)) fail(400, 'bad_action');
  return mutate(db, pid, token, opId, (g, world) => applyAction(g.state, world, action as ActionType));
}
export async function doCheckpoint(db: DB, pid: string, token: string | null | undefined, body: { checkpointId?: string; optionId?: string; marks?: Record<string, string[]> }, opId?: string) {
  const marks: Record<string, Label[]> = {};
  for (const [k, v] of Object.entries(body.marks ?? {})) {
    if (!/^[1-4],[1-4]$/.test(k) || !Array.isArray(v)) continue;
    marks[k] = v.filter((l): l is Label => LABELS.includes(l as Label));
  }
  if (!body.checkpointId) fail(400, 'checkpoint_required');
  return mutate(db, pid, token, opId, (g, world) => submitCheckpoint(g.state, world, { checkpointId: body.checkpointId!, optionId: body.optionId, marks, freeMarks: marks }, randomUUID()));
}
export async function getReport(db: DB, pid: string, token: string | null | undefined) {
  const { p } = await auth(db, pid, token);
  const g = await latestGame(db, pid);
  if (!g) return fail(404, 'no_game');
  if (g.state.agent.outcome === 'playing') {
    const attempts = await db.list('inference_attempts', { game_id: g.id });
    return buildReport(g.state, attempts.map((a) => ({ category: a.category, correct: a.correct, misconceptions: a.misconceptions ?? [] })));
  }
  const r = await db.get('assessment_results', g.id);
  void p;
  return r?.report;
}
export { HttpError as _HttpError };

/** A student's own recorded game. Only available once the game is over (it includes the actual world). */
export async function getOwnReplay(db: DB, pid: string, token: string | null | undefined) {
  await auth(db, pid, token);
  const g = await latestGame(db, pid);
  if (!g || g.state.agent.outcome === 'playing') return fail(409, 'game_not_over');
  const [events, records, world] = await Promise.all([db.list('game_events', { game_id: g.id }, { order: 'seq' }), loadRecords(db, g.id), loadWorld(db, g.id)]);
  return { events: events.map((e) => ({ seq: e.seq, kind: e.kind, payload: e.payload })), records, world: world ? { pits: world.pits, wumpus: world.wumpus, gold: world.gold } : null };
}
