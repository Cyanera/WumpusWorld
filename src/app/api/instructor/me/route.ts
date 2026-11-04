import { handler, instructorId, json } from '@/lib/server/http';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const GET = handler(async (req) => json({ id: instructorId(req) }));
