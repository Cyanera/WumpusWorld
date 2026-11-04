import { body, handler, instructorId, json } from '@/lib/server/http';
import { controlSession, ownedSession, sessionPublic, updateSettings } from '@/lib/server/service';
import { overview } from '@/lib/server/instructor';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req, { params }, db) => {
  const s = await ownedSession(db, instructorId(req), params.code);
  return json(await overview(db, s));
});
export const POST = handler(async (req, { params }, db) => {
  const s = await ownedSession(db, instructorId(req), params.code); const b = await body(req);
  return json(sessionPublic(await controlSession(db, s, b.action, b.minutes)));
});
export const PATCH = handler(async (req, { params }, db) => {
  const s = await ownedSession(db, instructorId(req), params.code); const b = await body(req);
  return json(sessionPublic(await updateSettings(db, s, b)));
});
