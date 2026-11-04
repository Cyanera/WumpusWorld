import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto';

const secret = () => process.env.AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-change-me');
export const COOKIE = 'ww_instructor';

export function sha256(s: string) { return createHash('sha256').update(s + '|' + secret()).digest('hex'); }
export function newToken() { return randomBytes(24).toString('base64url'); }
export function tokenMatches(token: string | null | undefined, hash: string) {
  if (!token) return false;
  const a = Buffer.from(sha256(token)), b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function makeInstructorCookie(instructorId: string, ttlHours = 12) {
  if (!secret()) throw new Error('AUTH_SECRET is not set');
  const payload = Buffer.from(JSON.stringify({ id: instructorId, exp: Date.now() + ttlHours * 3600_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readInstructorCookie(value: string | undefined | null): string | null {
  if (!value || !secret()) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const { id, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()); return exp > Date.now() ? id : null; } catch { return null; }
}
export function checkInstructorPassword(email: string, password: string) {
  const e = process.env.INSTRUCTOR_EMAIL ?? 'instructor@example.edu', p = process.env.INSTRUCTOR_PASSWORD ?? (process.env.NODE_ENV === 'production' ? '' : 'wumpus');
  if (!p) return false;
  const a = createHash('sha256').update(password).digest(), b = createHash('sha256').update(p).digest();
  return email.trim().toLowerCase() === e.toLowerCase() && timingSafeEqual(a, b);
}
