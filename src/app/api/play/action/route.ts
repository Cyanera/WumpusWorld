import { body, creds, handler, json } from '@/lib/server/http';
import { doAction } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const POST = handler(async (req, _c, db) => { const c = creds(req); const b = await body(req); return json(await doAction(db, c.pid, c.token, String(b.action), b.opId)); });
