import { creds, handler, json } from '@/lib/server/http';
import { getOwnReplay } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const GET = handler(async (req, _c, db) => { const c = creds(req); return json(await getOwnReplay(db, c.pid, c.token)); });
