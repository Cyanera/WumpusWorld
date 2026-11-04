import { handler, json } from '@/lib/server/http';
import { COOKIE } from '@/lib/server/auth';
export const POST = handler(async () => json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` }));
