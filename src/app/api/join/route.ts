import { body, handler, json } from '@/lib/server/http';
import { join } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req, _c, db) => {
  const b = await body(req);
  return json(await join(db, String(b.code ?? ''), String(b.name ?? ''), { pid: b.pid, token: b.token }));
});
