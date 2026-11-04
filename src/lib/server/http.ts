import { ConfigError, getDB } from './db';
import { COOKIE, readInstructorCookie } from './auth';
import { HttpError } from './service';

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export function cookieOf(req: Request, name: string) {
  const c = req.headers.get('cookie') ?? '';
  for (const part of c.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return null;
}
export function instructorId(req: Request): string {
  const id = readInstructorCookie(cookieOf(req, COOKIE));
  if (!id) throw new HttpError(401, 'unauthorized');
  return id;
}
/** Valid cookie AND the instructor still exists in the database (a stale cookie must force a fresh login). */
export async function requireInstructor(req: Request, db: ReturnType<typeof getDB>): Promise<string> {
  const id = instructorId(req);
  if (!(await db.get('instructors', id))) throw new HttpError(401, 'unauthorized');
  return id;
}
export async function body<T = any>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, 'bad_json'); }
}
export const creds = (req: Request) => ({ pid: req.headers.get('x-pid') ?? '', token: req.headers.get('x-token') });

export function handler(fn: (req: Request, ctx: any, db: ReturnType<typeof getDB>) => Promise<Response>) {
  return async (req: Request, ctx?: any) => {
    try { return await fn(req, ctx, getDB()); }
    catch (e) {
      if (e instanceof ConfigError) { console.error('[config]', e.message); return json({ error: 'not_configured', message: e.message }, 503); }
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      console.error('[api]', e);
      return json({ error: 'server_error' }, 500);
    }
  };
}
