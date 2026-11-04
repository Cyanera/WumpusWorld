'use client';
import { useEffect, useRef } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; pid?: string; token?: string } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'), cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(opts.pid ? { 'x-pid': opts.pid, 'x-token': opts.token ?? '' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { let code = 'error'; try { code = (await res.json()).error ?? code; } catch { /* ignore */ } throw new ApiError(res.status, code); }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

let sb: ReturnType<typeof createClient> | null = null;
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try { return (sb ??= createClient(url.trim(), key.trim(), { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 5 } } })); } catch { return null; } // bad env values must never crash the page
}

/**
 * Live updates: Supabase Realtime Broadcast ticks trigger an immediate refetch; polling is always on as a
 * reliable fallback (reconnects, missed messages, no-Supabase local mode).
 */
export function useLive(code: string | null, refetch: () => void, pollMs: number) {
  const ref = useRef(refetch); ref.current = refetch;
  useEffect(() => {
    if (!code) return;
    let last = 0;
    const kick = () => { const n = Date.now(); if (n - last > 700) { last = n; ref.current(); } };
    const poll = setInterval(() => { if (document.visibilityState === 'visible') ref.current(); }, pollMs);
    const onVis = () => document.visibilityState === 'visible' && kick();
    const onOnline = () => kick();
    document.addEventListener('visibilitychange', onVis); window.addEventListener('online', onOnline);
    let ch: RealtimeChannel | null = null;
    const c = client();
    try { if (c) ch = c.channel(`session:${code}`).on('broadcast', { event: '*' }, kick).subscribe(); } catch { ch = null; } // polling still works
    return () => { clearInterval(poll); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline); try { if (ch && c) c.removeChannel(ch); } catch { /* ignore */ } };
  }, [code, pollMs]);
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;
