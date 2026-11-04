import { body, handler, instructorId, json } from '@/lib/server/http';
import { createSession, sessionPublic } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req, _c, db) => {
  const id = instructorId(req);
  const rows = await db.list('classroom_sessions', { instructor_id: id }, { order: 'created_at', desc: true, limit: 50 });
  return json(rows.map((r) => sessionPublic(r)));
});
export const POST = handler(async (req, _c, db) => {
  const id = instructorId(req); const b = await body(req);
  return json(sessionPublic(await createSession(db, id, b)));
});
