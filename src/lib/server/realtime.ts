/**
 * Server-side Supabase Realtime *Broadcast* ping. Payloads never contain game data; clients refetch
 * through authenticated API routes. When Supabase is not configured this is a no-op and clients poll.
 */
export async function broadcast(code: string, event: string, payload: Record<string, unknown> = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: `session:${code}`, event, payload: { t: Date.now(), ...payload }, private: false }] }),
      signal: AbortSignal.timeout(2500),
    });
  } catch { /* clients also poll, so a missed broadcast is harmless */ }
}
