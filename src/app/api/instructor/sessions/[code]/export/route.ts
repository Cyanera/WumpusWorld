import { handler, instructorId } from '@/lib/server/http';
import { ownedSession } from '@/lib/server/service';
import { exportTables, exportXlsx, toCSV } from '@/lib/server/instructor';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const GET = handler(async (req, { params }, db) => {
  const s = await ownedSession(db, instructorId(req), params.code);
  const u = new URL(req.url); const format = u.searchParams.get('format') ?? 'csv';
  if (format === 'xlsx') {
    return new Response(new Uint8Array(await exportXlsx(db, s)), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="wumpus-${s.code}.xlsx"` } });
  }
  const t = await exportTables(db, s);
  const table = (u.searchParams.get('table') ?? 'students') as keyof typeof t;
  return new Response(toCSV((t[table] ?? t.students) as any), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="wumpus-${s.code}-${table}.csv"` } });
});
