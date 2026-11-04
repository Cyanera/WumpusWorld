import { handler, instructorId, json } from '@/lib/server/http';
import { perfectPlaythrough } from '@/lib/engine/demo';
export const dynamic = 'force-dynamic';
/** Fresh random demo game played by a perfect knowledge-based agent (instructor only: includes the hidden world). */
export const POST = handler(async (req) => {
  instructorId(req);
  const p = perfectPlaythrough();
  return json({ world: { pits: p.world.pits, wumpus: p.world.wumpus, gold: p.world.gold }, events: p.events.map((e) => ({ seq: e.seq, kind: e.kind, payload: e.payload })), records: p.records, attempts: p.attempts.map((a) => ({ ...a })) });
});
