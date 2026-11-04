import { handler, instructorId, json } from '@/lib/server/http';
import { ownedSession } from '@/lib/server/service';
import { studentDetail } from '@/lib/server/instructor';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req, { params }, db) => {
  const s = await ownedSession(db, instructorId(req), params.code);
  const d = await studentDetail(db, s, params.pid, new URL(req.url).searchParams.get('game') ?? undefined);
  return d ? json(d) : json({ error: 'not_found' }, 404);
});
