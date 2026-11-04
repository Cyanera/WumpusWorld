import { body, creds, handler, json } from '@/lib/server/http';
import { startGame } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req, _c, db) => { const c = creds(req); const b = await body(req).catch(() => ({})); return json(await startGame(db, c.pid, c.token, b.mode)); });
