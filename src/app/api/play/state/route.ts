import { creds, handler, json } from '@/lib/server/http';
import { getStudentState } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req, _c, db) => { const c = creds(req); return json(await getStudentState(db, c.pid, c.token)); });
