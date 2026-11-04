import { body, creds, handler, json } from '@/lib/server/http';
import { doCheckpoint } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req, _c, db) => { const c = creds(req); const b = await body(req); return json(await doCheckpoint(db, c.pid, c.token, b, b.opId)); });
