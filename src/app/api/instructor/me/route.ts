import { handler, requireInstructor, json } from '@/lib/server/http';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const GET = handler(async (req, _c, db) => json({ id: await requireInstructor(req, db) }));
