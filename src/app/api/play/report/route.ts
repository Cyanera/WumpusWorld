import { creds, handler, json } from '@/lib/server/http';
import { getReport } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req, _c, db) => { const c = creds(req); return json(await getReport(db, c.pid, c.token)); });
