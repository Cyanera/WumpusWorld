'use client';
import * as React from 'react';
import Link from 'next/link';
import { Maximize2, Shuffle, Users, ArrowRight } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Button } from '../ui/button';
import { Replay } from '../game/Replay';

/** Full-screen projector mode: step through a student's recorded game or a fresh random demo. */
export default function DemoMode({ code }: { code: string }) {
  const [src, setSrc] = React.useState<'fresh' | string>('fresh');
  const [students, setStudents] = React.useState<any[]>([]);
  const [data, setData] = React.useState<any>(null); const [loading, setLoading] = React.useState(false);
  const [view, setView] = React.useState<'natural' | 'formal' | 'both'>('both'); const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => { api('/api/instructor/sessions/' + code).then((d) => { setStudents(d.students.filter((s: any) => s.gameId)); setView(d.session.logic.view); }).catch(() => (location.href = '/instructor')); }, [code]);
  React.useEffect(() => {
    setLoading(true);
    (src === 'fresh' ? api('/api/instructor/demo', { body: {} }) : api(`/api/instructor/sessions/${code}/students/${src}`)).then((d) => setData(d)).finally(() => setLoading(false));
  }, [src, nonce, code]);
  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-cave-950 p-4 text-xl">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/instructor/s/${code}`}><Button variant="outline"><ArrowRight />اللوحة</Button></Link>
        <h1 className="text-3xl font-black">وضع العرض · Demonstration</h1>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <select value={src} onChange={(e) => setSrc(e.target.value)} className="h-12 rounded-xl border border-cave-600 bg-cave-900 px-3" aria-label="مصدر العرض">
            <option value="fresh">لعبة جديدة عشوائية (Perfect Agent)</option>{students.map((s) => <option key={s.id} value={s.id}>لعبة {s.name}</option>)}</select>
          {src === 'fresh' && <Button variant="secondary" onClick={() => setNonce(nonce + 1)}><Shuffle />لعبة جديدة</Button>}
          {(['natural', 'formal', 'both'] as const).map((v) => <Button key={v} variant={view === v ? 'default' : 'outline'} onClick={() => setView(v)}>{v}</Button>)}
          <Button variant="outline" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 />ملء الشاشة</Button>
        </div>
      </header>
      {loading || !data ? <p className="p-20 text-center">جارٍ التحميل…</p> : (data.events ?? []).length === 0 ? <p className="p-20 text-center text-slate-400"><Users className="mx-auto" />لا توجد لعبة مسجلة لهذه الطالبة بعد.</p> :
        <Replay key={(src === 'fresh' ? nonce : src) + (data.game?.id ?? '')} events={data.events} records={data.records} world={data.world} logicView={view} large />}
    </main>
  );
}
