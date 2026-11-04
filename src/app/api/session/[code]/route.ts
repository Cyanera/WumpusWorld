import { handler, json } from '@/lib/server/http';
import { getSessionByCode, sessionPublic } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const GET = handler(async (_req, { params }, db) => {
  const s = sessionPublic(await getSessionByCode(db, params.code));
  return json({ code: s.code, title: s.title, status: s.status, mode: s.mode, remainingSec: s.remainingSec });
});
