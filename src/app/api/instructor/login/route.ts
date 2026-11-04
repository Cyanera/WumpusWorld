import { body, handler, json } from '@/lib/server/http';
import { COOKIE, checkInstructorPassword, makeInstructorCookie } from '@/lib/server/auth';
import { ensureInstructor } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
const fails = new Map<string, { n: number; t: number }>();
export const POST = handler(async (req, _c, db) => {
  const b = await body(req);
  const ip = req.headers.get('x-forwarded-for') ?? 'local';
  const f = fails.get(ip);
  if (f && f.n >= 8 && Date.now() - f.t < 10 * 60_000) return json({ error: 'too_many_attempts' }, 429);
  if (!checkInstructorPassword(String(b.email ?? ''), String(b.password ?? ''))) {
    fails.set(ip, { n: (f?.n ?? 0) + 1, t: Date.now() });
    return json({ error: 'invalid_credentials' }, 401);
  }
  fails.delete(ip);
  const inst = await ensureInstructor(db, String(b.email));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${encodeURIComponent(makeInstructorCookie(inst.id))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}` });
});
