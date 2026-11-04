'use client';
import * as React from 'react';
import Link from 'next/link';
import { Loader2, LogOut, Plus, Presentation } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATUS_AR: Record<string, string> = { lobby: 'لم تبدأ', active: 'جارية', paused: 'متوقفة مؤقتاً', finished: 'منتهية' };

export default function InstructorHome() {
  const [auth, setAuth] = React.useState<boolean | null>(null);
  const [sessions, setSessions] = React.useState<any[]>([]);
  const load = React.useCallback(async () => {
    try { await api('/api/instructor/me'); setAuth(true); setSessions(await api('/api/instructor/sessions')); } catch (e) { setAuth(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  if (auth === null) return <main className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></main>;
  if (!auth) return <Login onDone={load} />;
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between"><h1 className="text-3xl font-black">لوحة المحاضرة · Wumpus World</h1>
        <Button variant="outline" onClick={async () => { await api('/api/instructor/logout', { body: {} }); setAuth(false); }}><LogOut className="h-4 w-4" />خروج</Button></header>
      <CreateForm onCreated={load} />
      <Card><CardHeader><CardTitle className="text-xl">الجلسات السابقة</CardTitle></CardHeader><CardContent>
        {sessions.length === 0 ? <p className="text-slate-400">لا توجد جلسات بعد.</p> : (
          <ul className="divide-y divide-cave-700">{sessions.map((s) => (
            <li key={s.code} className="flex items-center justify-between gap-3 py-3">
              <div><b className="text-lg">{s.title}</b> <Badge>{STATUS_AR[s.status]}</Badge><p className="text-sm text-slate-400">الرمز <span className="font-mono tracking-widest text-amber-300">{s.code}</span> · {s.mode === 'guided' ? 'Guided Learning' : 'Challenge'}</p></div>
              <Link href={`/instructor/s/${s.code}`}><Button><Presentation className="h-4 w-4" />فتح اللوحة</Button></Link>
            </li>))}</ul>)}
      </CardContent></Card>
    </main>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = React.useState(''); const [password, setPassword] = React.useState(''); const [err, setErr] = React.useState(''); const [busy, setBusy] = React.useState(false);
  return (
    <main dir="rtl" lang="ar" className="flex min-h-screen items-center justify-center p-6">
      <form className="w-full max-w-sm space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api('/api/instructor/login', { body: { email, password } }); onDone(); } catch (x) { setErr(x instanceof ApiError && x.status === 429 ? 'محاولات كثيرة، حاولي لاحقاً' : 'بيانات الدخول غير صحيحة'); } finally { setBusy(false); } }}>
        <h1 className="text-3xl font-black">دخول المحاضرة</h1>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" autoComplete="username" className="h-12 w-full rounded-xl border border-cave-600 bg-cave-900 px-4" dir="ltr" />
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" autoComplete="current-password" className="h-12 w-full rounded-xl border border-cave-600 bg-cave-900 px-4" dir="ltr" />
        {err && <p role="alert" className="text-red-300">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : 'دخول'}</Button>
      </form>
    </main>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = React.useState({ title: 'Wumpus World', mode: 'guided', difficulty: 'normal', pits: 2, durationMinutes: 20 }); const [busy, setBusy] = React.useState(false);
  const field = 'h-11 w-full rounded-xl border border-cave-600 bg-cave-900 px-3';
  return (
    <Card><CardHeader><CardTitle className="text-xl">إنشاء جلسة جديدة</CardTitle></CardHeader><CardContent>
      <form className="grid gap-4 md:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const s = await api('/api/instructor/sessions', { body: f }); location.href = `/instructor/s/${s.code}`; } finally { setBusy(false); onCreated(); } }}>
        <label className="md:col-span-2 text-sm">العنوان<input className={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="text-sm">الوضع<select className={field} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="guided">Guided Learning</option><option value="challenge">Challenge</option></select></label>
        <label className="text-sm">الصعوبة<select className={field} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="easy">سهل</option><option value="normal">متوسط</option><option value="hard">صعب</option></select></label>
        <label className="text-sm">عدد Pits<input type="number" min={1} max={5} className={field} value={f.pits} onChange={(e) => setF({ ...f, pits: +e.target.value })} /></label>
        <label className="text-sm">المدة (دقيقة)<input type="number" min={1} max={120} className={field} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: +e.target.value })} /></label>
        <div className="md:col-span-4" /><Button size="lg" disabled={busy}><Plus className="h-5 w-5" />إنشاء</Button>
      </form></CardContent></Card>
  );
}
