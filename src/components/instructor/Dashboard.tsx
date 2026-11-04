'use client';
import * as React from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, CheckCircle2, Clock, Download, FileSpreadsheet, Maximize2, Pause, Play, QrCode, Skull, Square, Target, Timer, Trophy, Users, X, BookOpen, Eye, EyeOff, Plus } from 'lucide-react';
import { api, fmtTime, useLive } from '@/lib/client/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs } from '../ui/tabs';
import { Replay, replayCells } from '../game/Replay';
import { CaveGrid } from '../game/CaveGrid';
import { RecordCard, Legend } from '../game/LogicSection';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../ThemeToggle';
import type { InferenceRecord } from '@/lib/engine/reasoner';
import { Pos } from '@/lib/engine/types';

const STATUS_AR: Record<string, string> = { lobby: 'لم تبدأ', active: 'جارية', paused: 'متوقفة مؤقتاً', finished: 'منتهية' };
const PLAYER_AR: Record<string, string> = { waiting: 'بانتظار البدء', playing: 'تلعب', won: 'نجحت (ذهب + خروج)', escaped_no_gold: 'خرجت بدون ذهب', dead: 'ماتت', timeout: 'انتهى الوقت' };
const PLAYER_TONE: Record<string, any> = { waiting: 'default', playing: 'blue', won: 'green', escaped_no_gold: 'amber', dead: 'red', timeout: 'default' };
const KIND_AR: Record<string, string> = {
  meaning_breeze: 'ماذا تعني Breeze؟', meaning_stench: 'ماذا تعني Stench؟', safe_clear: 'تحديد المربعات الآمنة (No Breeze / No Stench)', possible_pit: 'Possible Pit بعد Breeze',
  possible_wumpus: 'Possible Wumpus بعد Stench', elimination: 'استبعاد احتمال بملاحظة جديدة', safe_combined: 'مربع آمن بعد دمج المعلومات', confirmed_pit: 'Confirmed Pit', confirmed_wumpus: 'Confirmed Wumpus', free_check: 'فحص حر (Challenge)',
};

export default function Dashboard({ code }: { code: string }) {
  const [d, setD] = React.useState<any>(null); const [tab, setTab] = React.useState('students'); const [qr, setQr] = React.useState(false);
  const [sel, setSel] = React.useState<string | null>(null); const [off, setOff] = React.useState(0); const fetched = React.useRef(Date.now()); const [now, setNow] = React.useState(Date.now());
  const refresh = React.useCallback(async () => { try { const r = await api('/api/instructor/sessions/' + code); fetched.current = Date.now(); setD(r); } catch (e: any) { if (e.status === 401 || e.status === 403) location.href = '/instructor'; } }, [code]);
  React.useEffect(() => { refresh(); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [refresh]);
  useLive(code, refresh, 3000); void off; void setOff;
  if (!d) return <main className="p-10 text-center" dir="rtl">جارٍ التحميل…</main>;
  const s = d.session; const m = d.metrics;
  const remaining = s.status === 'active' ? Math.max(0, s.remainingSec - Math.floor((now - fetched.current) / 1000)) : s.remainingSec;
  const ctl = async (action: string, minutes?: number) => { await api('/api/instructor/sessions/' + code, { body: { action, minutes } }); refresh(); };
  const patch = async (b: any) => { await api('/api/instructor/sessions/' + code, { method: 'PATCH', body: b }); refresh(); };
  return (
    <main dir="rtl" lang="ar" className="mx-auto max-w-[1600px] space-y-5 p-5 text-lg">
      <header className="flex flex-wrap items-center gap-3">
        <div><Link href="/instructor" className="text-sm text-slate-400">← الجلسات</Link><h1 className="text-3xl font-black">{s.title}</h1></div>
        <div className="rounded-2xl bg-cave-800 px-4 py-2 text-center"><div className="text-xs text-slate-400">رمز الانضمام</div><div className="font-mono text-3xl font-black tracking-[0.25em] text-amber-300" dir="ltr">{s.code}</div></div>
        <Badge className="text-base" tone={s.status === 'active' ? 'green' : s.status === 'paused' ? 'amber' : 'default'}>{STATUS_AR[s.status]}</Badge>
        <div className="ms-auto flex flex-wrap gap-2">
          <ThemeToggle className="h-12 w-12" />
          {s.status === 'lobby' && <Button size="lg" variant="success" onClick={() => ctl('start')}><Play />بدء النشاط</Button>}
          {s.status === 'active' && <Button size="lg" variant="secondary" onClick={() => ctl('pause')}><Pause />إيقاف مؤقت</Button>}
          {s.status === 'paused' && <Button size="lg" variant="success" onClick={() => ctl('resume')}><Play />استئناف</Button>}
          {s.status !== 'lobby' && s.status !== 'finished' && <Button size="lg" variant="outline" onClick={() => ctl('extend', 5)}><Plus />5 دقائق</Button>}
          {s.status !== 'finished' && s.status !== 'lobby' && <Button size="lg" variant="danger" onClick={() => confirm('إنهاء الجلسة لجميع الطالبات؟') && ctl('finish')}><Square />إنهاء</Button>}
          <Button size="lg" variant="outline" onClick={() => setQr(true)}><QrCode />QR</Button>
          <Link href={`/instructor/s/${code}/demo`}><Button size="lg" variant="outline"><Maximize2 />وضع العرض Demo</Button></Link>
          <a href={`/api/instructor/sessions/${code}/export?format=csv`}><Button size="lg" variant="outline"><Download />CSV</Button></a>
          <a href={`/api/instructor/sessions/${code}/export?format=xlsx`}><Button size="lg" variant="outline"><FileSpreadsheet />Excel</Button></a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="مؤشرات">
        <Metric icon={<Users />} label="عدد الطالبات المشاركات" v={m.participants} />
        <Metric icon={<Activity />} label="الطالبات النشطات" v={m.active} tone="text-sky-300" />
        <Metric icon={<CheckCircle2 />} label="الطالبات المكتملات" v={m.completed} tone="text-emerald-300" />
        <Metric icon={<Target />} label="متوسط Inference Accuracy" v={m.avgAccuracy === null ? '—' : m.avgAccuracy + '%'} tone="text-amber-300" />
        <Metric icon={<AlertTriangle />} label="عدد القرارات الخطرة" v={m.risky} tone="text-orange-300" />
        <Metric icon={<Skull />} label="عدد الوفيات" v={m.deaths} tone="text-red-300" />
        <Metric icon={<Trophy />} label="وجدن الذهب" v={m.foundGold} tone="text-yellow-300" />
        <Metric icon={<Timer />} label="الوقت المتبقي" v={fmtTime(remaining)} tone={remaining < 60 && s.status === 'active' ? 'text-red-300' : ''} />
      </section>

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'students', label: 'الطالبات' }, { id: 'analytics', label: 'التحليلات والمفاهيم الخاطئة' }, { id: 'logic', label: 'القواعد المنطقية Logical Rules' }, { id: 'settings', label: 'الإعدادات' }]} />
      {tab === 'students' && <StudentsTab rows={d.students} onOpen={setSel} />}
      {tab === 'analytics' && <AnalyticsTab a={d.analytics} revealed={s.settings.revealed ?? {}} onReveal={(k, v) => patch({ revealed: { [k]: v } })} />}
      {tab === 'logic' && <LogicTab code={code} s={s} students={d.students} patch={patch} />}
      {tab === 'settings' && <SettingsTab s={s} patch={patch} />}
      {sel && <StudentDrawer code={code} pid={sel} view={s.logic.view} onClose={() => setSel(null)} />}
      {qr && <QrModal code={code} onClose={() => setQr(false)} />}
    </main>
  );
}

const Metric = ({ icon, label, v, tone = '' }: { icon: React.ReactNode; label: string; v: React.ReactNode; tone?: string }) => (
  <Card><CardContent className="p-3 text-center"><div className={cn('mx-auto mb-1 flex justify-center [&>svg]:h-5 [&>svg]:w-5', tone)}>{icon}</div><div className={cn('text-3xl font-black tabular-nums', tone)}>{v}</div><div className="mt-1 text-xs leading-tight text-slate-300">{label}</div></CardContent></Card>
);

function StudentsTab({ rows, onOpen }: { rows: any[]; onOpen: (id: string) => void }) {
  const [q, setQ] = React.useState(''); const [flt, setFlt] = React.useState('all'); const [sort, setSort] = React.useState<{ k: string; dir: 1 | -1 }>({ k: 'name', dir: 1 });
  const data = rows.filter((r) => (flt === 'all' || r.status === flt || (flt === 'active' && r.active)) && r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => { const x = a[sort.k] ?? -1, y = b[sort.k] ?? -1; return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  const th = (k: string, label: string) => <th className="cursor-pointer px-3 py-3 text-start" onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : 1 })} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>{label}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>;
  return (
    <Card><CardContent>
      <div className="mb-3 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم" className="h-11 rounded-xl border border-cave-600 bg-cave-900 px-3" />
        <select value={flt} onChange={(e) => setFlt(e.target.value)} className="h-11 rounded-xl border border-cave-600 bg-cave-900 px-3" aria-label="تصفية">
          <option value="all">الكل</option><option value="active">النشطات</option>{Object.entries(PLAYER_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="overflow-auto"><table className="w-full text-base">
        <thead className="bg-cave-800 text-sm text-slate-300"><tr>{th('name', 'Student')}{th('x', 'Current Square')}{th('progress', 'Progress')}{th('accuracy', 'Inference Accuracy')}{th('risky', 'Risky Actions')}{th('status', 'Status')}</tr></thead>
        <tbody>{data.map((r) => (
          <tr key={r.id} tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.id)} className="cursor-pointer border-b border-cave-700 hover:bg-cave-800">
            <td className="px-3 py-3 font-bold">{r.name} {r.active && <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" title="نشطة" />}</td>
            <td className="px-3 font-mono" dir="ltr">[{r.x},{r.y}]</td>
            <td className="px-3"><div className="h-3 w-40 overflow-hidden rounded-full bg-cave-700"><div className="h-full bg-amber-500" style={{ width: `${r.progress}%` }} /></div><span className="text-xs text-slate-400">{r.progress}%</span></td>
            <td className="px-3 font-bold">{r.accuracy === null ? '—' : `${r.accuracy}%`}</td>
            <td className={cn('px-3 font-bold', r.risky > 0 && 'text-orange-300')}>{r.risky}</td>
            <td className="px-3"><Badge tone={PLAYER_TONE[r.status]}>{PLAYER_AR[r.status] ?? r.status}</Badge></td>
          </tr>))}
          {!data.length && <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد طالبات مطابقة.</td></tr>}</tbody></table></div>
    </CardContent></Card>
  );
}

const COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#2dd4bf'];
function AnalyticsTab({ a, revealed, onReveal }: { a: any; revealed: Record<string, boolean>; onReveal: (k: string, v: boolean) => void }) {
  const cats = a.categories.map((c: any) => ({ ...c, v: c.pct ?? 0 }));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-xl">مهارات الاستدلال (% إجابات صحيحة)</CardTitle></CardHeader><CardContent>
        <div className="h-80" dir="ltr"><ResponsiveContainer><BarChart data={cats} layout="vertical" margin={{ left: 40, right: 20 }}>
          <CartesianGrid stroke="#2a2542" horizontal={false} /><XAxis type="number" domain={[0, 100]} stroke="#94a3b8" /><YAxis type="category" dataKey="label" width={190} stroke="#cbd5e1" tick={{ fontSize: 13 }} />
          <Tooltip contentStyle={{ background: '#14121f', border: '1px solid #3a3358' }} formatter={(v: any, _n: any, p: any) => [`${p.payload.pct ?? '—'}% (${p.payload.correct}/${p.payload.total})`, 'Accuracy']} />
          <Bar dataKey="v" radius={[0, 8, 8, 0]}>{cats.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
        <table className="mt-2 w-full text-sm"><tbody>{a.categories.map((c: any) => <tr key={c.id} className="border-t border-cave-700"><td className="py-1" dir="ltr">{c.label}</td><td className="text-end">{c.total ? `${c.correct}/${c.total}` : '—'}</td></tr>)}</tbody></table>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-xl">المفاهيم الخاطئة الشائعة</CardTitle></CardHeader><CardContent>
        {a.misconceptions.length === 0 ? <p className="text-slate-400">لم تُسجل مفاهيم خاطئة بعد.</p> : <ul className="space-y-3">{a.misconceptions.map((m: any) => (
          <li key={m.id}><div className="flex justify-between"><span>{m.ar}</span><b>{m.students} طالبة · {m.count}</b></div><div className="mt-1 h-2 rounded-full bg-cave-700"><div className="h-2 rounded-full bg-rose-400" style={{ width: `${Math.min(100, m.count / a.misconceptions[0].count * 100)}%` }} /></div></li>))}</ul>}
      </CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-xl">توزيع إجابات الصف عند كل Checkpoint</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        {a.checkpoints.length === 0 && <p className="text-slate-400">ستظهر الإجابات هنا مباشرة بعد وصول الطالبات للـ checkpoints.</p>}
        {a.checkpoints.map((c: any) => (
          <div key={c.kind} className="rounded-xl bg-cave-800 p-4">
            <div className="mb-2 flex items-center justify-between gap-2"><b>{KIND_AR[c.kind] ?? c.kind}</b><span className="text-sm text-slate-300">{c.total} إجابة</span></div>
            {c.options ? c.options.map((o: any) => (
              <div key={o.id} className="mb-2" dir="ltr"><div className="flex justify-between text-sm"><span className={cn(revealed[c.kind] && o.correct && 'font-black text-emerald-300')}>{revealed[c.kind] && o.correct ? '✔ ' : ''}{o.text}</span><b>{o.count}</b></div>
                <div className="h-3 rounded-full bg-cave-700"><div className={cn('h-3 rounded-full', revealed[c.kind] && o.correct ? 'bg-emerald-400' : 'bg-sky-400')} style={{ width: `${c.total ? (o.count / c.total) * 100 : 0}%` }} /></div></div>
            )) : (<div dir="ltr"><div className="flex justify-between text-sm"><span>Correct</span><b>{c.correct}</b></div><div className="h-3 rounded-full bg-cave-700"><div className="h-3 rounded-full bg-emerald-400" style={{ width: `${c.pct}%` }} /></div>
              <div className="mt-2 flex justify-between text-sm"><span>Incorrect</span><b>{c.total - c.correct}</b></div><div className="h-3 rounded-full bg-cave-700"><div className="h-3 rounded-full bg-rose-400" style={{ width: `${100 - c.pct}%` }} /></div>
              {c.misconceptions.length > 0 && <ul className="mt-2 text-sm text-slate-300">{c.misconceptions.map((m: any) => <li key={m.id}>• {m.en} ({m.count})</li>)}</ul>}</div>)}
            {c.options && <Button size="sm" variant="outline" className="mt-1" onClick={() => onReveal(c.kind, !revealed[c.kind])}>{revealed[c.kind] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{revealed[c.kind] ? 'إخفاء الإجابة الصحيحة' : 'إظهار الإجابة الصحيحة'}</Button>}
          </div>))}
      </CardContent></Card>
    </div>
  );
}

function LogicTab({ code, s, students, patch }: { code: string; s: any; students: any[]; patch: (b: any) => void }) {
  const [pid, setPid] = React.useState(''); const [detail, setDetail] = React.useState<any>(null); const [rid, setRid] = React.useState('');
  const [view, setView] = React.useState<'natural' | 'formal' | 'both'>(s.logic.view);
  React.useEffect(() => { if (!pid) return; api(`/api/instructor/sessions/${code}/students/${pid}`).then((x) => { setDetail(x); setRid(x.records?.[x.records.length - 1]?.id ?? ''); }); }, [pid, code]);
  const rec: InferenceRecord | undefined = detail?.records?.find((r: InferenceRecord) => r.id === rid);
  const evIdx = detail && rec ? detail.events.findIndex((e: any) => (e.payload.recordIds ?? []).includes(rec.id)) : -1;
  const grid = evIdx >= 0 ? replayCells(detail.events, evIdx) : null; const ev = evIdx >= 0 ? detail.events[evIdx].payload : null;
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex flex-wrap items-center gap-4">
        <b className="text-xl">قسم Logical Rules للطالبات:</b>
        <Button variant={s.logic.enabled ? 'success' : 'secondary'} onClick={() => patch({ logic_enabled: !s.logic.enabled })}>{s.logic.enabled ? <Eye /> : <EyeOff />}{s.logic.enabled ? 'ظاهر (بعد أول Checkpoint)' : 'مخفي'}</Button>
        <span className="text-slate-300">عرض الطالبات:</span>
        {(['natural', 'formal', 'both'] as const).map((v) => <Button key={v} variant={s.logic.view === v ? 'default' : 'outline'} onClick={() => { patch({ logic_view: v }); setView(v); }}>{{ natural: 'Natural Language', formal: 'Formal Logic', both: 'الاثنان' }[v]}</Button>)}
        <a href={`/api/instructor/sessions/${code}/export?table=rules`} className="ms-auto"><Button variant="outline"><Download />تصدير ملخص القواعد (CSV)</Button></a>
      </CardContent></Card>
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card><CardHeader><CardTitle>اختيار استنتاج مسجّل</CardTitle></CardHeader><CardContent className="space-y-3">
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="h-11 w-full rounded-xl border border-cave-600 bg-cave-900 px-3"><option value="">اختاري طالبة…</option>{students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</select>
          <ol className="max-h-[460px] space-y-1 overflow-auto" dir="ltr">{(detail?.records ?? []).map((r: InferenceRecord) => <li key={r.id}><button onClick={() => setRid(r.id)} className={cn('w-full rounded-lg px-2 py-2 text-start text-sm', r.id === rid ? 'bg-amber-500 text-black' : 'bg-cave-800 hover:bg-cave-700')}><b>{r.ruleName}</b><br />{r.inference.text}</button></li>)}</ol>
          {pid && detail && detail.records.length === 0 && <p className="text-slate-400">لا توجد استنتاجات.</p>}
        </CardContent></Card>
        <Card><CardContent>
          {!rec ? <p className="py-20 text-center text-slate-400">اختاري طالبة ثم استنتاجاً لعرضه على الشاشة.</p> : (
            <div className="grid gap-4 lg:grid-cols-2" dir="ltr">
              <div>{grid && ev && <CaveGrid cells={grid.cells} agent={ev.agent} highlight={rec.squares} eliminated={rec.eliminated.map((e) => e.pos)} goldTaken={grid.goldTaken} wumpusDead={!ev.agent.wumpusAlive} />}</div>
              <div className="space-y-3 text-lg"><div className="flex gap-2">{(['natural', 'formal', 'both'] as const).map((v) => <Button key={v} size="sm" variant={view === v ? 'default' : 'outline'} onClick={() => setView(v)}>{v}</Button>)}</div><RecordCard rec={rec} view={view} defaultOpen /><Legend /></div>
            </div>)}
        </CardContent></Card>
      </div>
    </div>
  );
}

function SettingsTab({ s, patch }: { s: any; patch: (b: any) => void }) {
  return (
    <Card><CardContent className="grid gap-4 md:grid-cols-3">
      <div><p className="mb-2 font-bold">الوضع للطالبات الجدد</p><div className="flex gap-2">{(['guided', 'challenge'] as const).map((m) => <Button key={m} variant={s.mode === m ? 'default' : 'outline'} onClick={() => patch({ mode: m })}>{m === 'guided' ? 'Guided Learning' : 'Challenge'}</Button>)}</div></div>
      <div><p className="mb-2 font-bold">الصعوبة</p><div className="flex gap-2">{(['easy', 'normal', 'hard'] as const).map((m) => <Button key={m} variant={s.difficulty === m ? 'default' : 'outline'} onClick={() => patch({ difficulty: m })}>{{ easy: 'سهل', normal: 'متوسط', hard: 'صعب' }[m]}</Button>)}</div></div>
      <div><p className="mb-2 font-bold">عدد Pits (للألعاب الجديدة)</p><div className="flex gap-2">{[1, 2, 3, 4].map((n) => <Button key={n} variant={s.pits === n ? 'default' : 'outline'} onClick={() => patch({ pits: n })}>{n}</Button>)}</div></div>
      <p className="md:col-span-3 text-sm text-slate-400">كل لعبة جديدة تُولَّد عشوائياً على الخادم ولا تظهر خريطتها الحقيقية للطالبة إلا بعد انتهاء اللعبة.</p>
    </CardContent></Card>
  );
}

function StudentDrawer({ code, pid, view, onClose }: { code: string; pid: string; view: 'natural' | 'formal' | 'both'; onClose: () => void }) {
  const [d, setD] = React.useState<any>(null); const [gid, setGid] = React.useState<string>('');
  React.useEffect(() => { api(`/api/instructor/sessions/${code}/students/${pid}${gid ? `?game=${gid}` : ''}`).then(setD); }, [code, pid, gid]);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="تفاصيل الطالبة">
      <div className="mx-auto max-w-7xl rounded-3xl border border-cave-600 bg-cave-950 p-5">
        <div className="mb-3 flex items-center gap-3"><h2 className="text-2xl font-black">{d?.participant?.name ?? '…'}</h2>
          {d?.games?.length > 1 && <select value={gid || d.game?.id} onChange={(e) => setGid(e.target.value)} className="h-10 rounded-lg bg-cave-800 px-2">{d.games.map((g: any, i: number) => <option key={g.id} value={g.id}>لعبة {d.games.length - i} · {g.status}</option>)}</select>}
          <Button className="ms-auto" variant="outline" onClick={onClose}><X />إغلاق</Button></div>
        {!d ? <p>جارٍ التحميل…</p> : !d.game ? <p className="text-slate-400">لم تبدأ اللعب بعد.</p> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[['النتيجة', d.game.status], ['Game score', d.game.score], ['استنتاجات صحيحة', d.game.stats.correctInferences], ['استنتاجات خاطئة', d.game.stats.incorrectInferences], ['قرارات خطرة', d.game.stats.riskyDecisions]].map(([k, v]) => <div key={String(k)} className="rounded-xl bg-cave-800 p-3 text-center"><div className="text-2xl font-black text-amber-300" dir="ltr">{String(v)}</div><div className="text-xs text-slate-300">{k}</div></div>)}
            </div>
            <Replay events={d.events} records={d.records} world={d.world} logicView={view} />
            <div className="grid gap-4 lg:grid-cols-2" dir="ltr">
              <div><h3 className="mb-2 font-bold">Inference attempts</h3><ul className="space-y-1 text-sm">{d.attempts.map((a: any) => <li key={a.id} className={cn('rounded-lg px-3 py-2', a.correct ? 'bg-emerald-950/60' : 'bg-red-950/50')}>{a.correct ? '✓' : '✗'} <b>{a.kind.replace(/_/g, ' ')}</b> (step {a.step}){a.misconceptions?.length ? <span className="text-orange-300"> · {a.misconceptions.join(', ')}</span> : null}</li>)}{!d.attempts.length && <li className="text-slate-400">none</li>}</ul></div>
              <div><h3 className="mb-2 font-bold">Percept & movement history</h3><ol className="max-h-72 space-y-1 overflow-auto text-sm">{d.events.filter((e: any) => e.kind === 'action' || e.kind === 'start').map((e: any) => <li key={e.seq} className="rounded bg-cave-800 px-3 py-1 font-mono">{e.kind === 'start' ? 'start' : e.payload.action} → [{e.payload.agent.x},{e.payload.agent.y}] {Object.entries(e.payload.percepts).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}{e.payload.risky ? ' ⚠' : ''}</li>)}</ol></div>
            </div>
          </div>)}
      </div>
    </div>
  );
}

function QrModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [src, setSrc] = React.useState(''); const url = `${process.env.NEXT_PUBLIC_APP_URL || location.origin}/play/${code}`;
  React.useEffect(() => { QRCode.toDataURL(url, { width: 520, margin: 2, color: { dark: '#0b0a12', light: '#ffffff' } }).then(setSrc); }, [url]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="رمز QR للانضمام">
      <div className="keep-color rounded-3xl bg-white p-6 text-center text-black" onClick={(e) => e.stopPropagation()}>
        {src && <img src={src} alt={`QR code to join ${code}`} className="mx-auto h-[min(70vh,520px)] w-auto" />}
        <p className="mt-2 text-2xl font-black">امسحي الرمز أو ادخلي الرمز</p><p className="font-mono text-6xl font-black tracking-[0.3em]" dir="ltr">{code}</p><p className="mt-1 text-sm text-slate-600" dir="ltr">{url}</p>
        <Button className="mt-3" onClick={onClose}>إغلاق</Button>
      </div>
    </div>
  );
}
