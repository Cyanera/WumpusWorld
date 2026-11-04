import { handler, instructorId, json } from '@/lib/server/http';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => json({ id: instructorId(req) }));
