'use client';
import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, Brain, Clock, Crosshair, DoorOpen, Hand, Library, Loader2, RotateCcw, RotateCw, Trophy, Wifi, WifiOff, CheckCircle2, XCircle, Swords, GraduationCap } from 'lucide-react';
import { api, ApiError, fmtTime, useLive } from '@/lib/client/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Collapsible } from '../ui/collapsible';
import { CaveGrid } from './CaveGrid';
import { PerceptStrip } from './Percepts';
import { LogicSection } from './LogicSection';
import { Replay } from './Replay';
import { LabelChip, LABEL_META } from '../art/Labels';
import type { StudentGameView } from '@/lib/engine/game';
import { Label, Pos } from '@/lib/engine/types';
import { TASK_LABELS } from '@/lib/engine/checkpoints';
import { cn } from '@/lib/utils';

interface Payload {
  session: { code: string; title: string; status: string; mode: string; remainingSec: number; serverNow: number; durationMinutes: number };
  me: { id: string; name: string }; game: StudentGameView | null; logic: { enabled: boolean; available: boolean; view: 'natural' | 'formal' | 'both' };
}
interface Creds { pid: string; token: string; name: string }
const store = (code: string) => `ww:${code}`;
const loadCreds = (code: string): Creds | null => { try { return JSON.parse(localStorage.getItem(store(code)) || 'null'); } catch { return null; } };

export default function StudentApp({ code }: { code: string }) {
  const [creds, setCreds] = React.useState<Creds | null | undefined>(undefined);
  const [data, setData] = React.useState<Payload | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const fetchedAt = React.useRef(Date.now());
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => { setCreds(loadCreds(code)); }, [code]);
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const refresh = React.useCallback(async () => {
    if (!creds) return;
    try {
      const d = await api<Payload>('/api/play/state', { pid: creds.pid, token: creds.token });
      fetchedAt.current = Date.now(); setData(d); setOnline(true); setErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { localStorage.removeItem(store(code)); setCreds(null); }
      else setOnline(false);
    }
  }, [creds, code]);
  React.useEffect(() => { refresh(); }, [refresh]);
  useLive(creds ? code : null, refresh, 4000);

  // auto-start the game as soon as the instructor opens the session
  const lastTry = React.useRef(0);
  React.useEffect(() => {
    if (!creds || !data || data.game || data.session.status !== 'active' || busy || Date.now() - lastTry.current < 3000) return;
    lastTry.current = Date.now();
    (async () => { try { setBusy(true); setData(await api<Payload>('/api/play/start', { body: {}, pid: creds.pid, token: creds.token })); } catch { /* retry on next poll */ } finally { setBusy(false); } })();
  }, [creds, data, busy]);

  if (creds === undefined) return <Center><Loader2 className="h-8 w-8 animate-spin" /></Center>;
  if (!creds) return <JoinForm code={code} onJoined={(c) => { localStorage.setItem(store(code), JSON.stringify(c)); setCreds(c); }} />;
  if (!data) return <Center><Loader2 className="h-8 w-8 animate-spin" /><p className="mt-2 text-slate-300">Connecting…</p></Center>;

  const remaining = data.session.status === 'active' ? Math.max(0, data.session.remainingSec - Math.floor((now - fetchedAt.current) / 1000)) : data.session.remainingSec;
  const call = async (path: string, body: unknown) => {
    if (busy) return null;
    setBusy(true);
    try {
      const d = await api<Payload>(path, { body: { ...(body as object), opId: crypto.randomUUID() }, pid: creds.pid, token: creds.token });
      fetchedAt.current = Date.now(); setData(d); setErr(null); setOnline(true); return d;
    } catch (e) {
      if (e instanceof ApiError) { setErr(e.code); if (e.status === 409) refresh(); } else setOnline(false);
      return null;
    } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-3 px-2 pb-24 pt-2">
      <Header data={data} remaining={remaining} online={online} />
      {err && <div role="alert" className="rounded-xl bg-red-900/60 p-2 text-center text-sm">{errText(err)}</div>}
      {data.session.status === 'lobby' && <WaitCard text="You're in! Waiting for your instructor to start the activity…" />}
      {data.session.status === 'paused' && <WaitCard text="The instructor paused the activity." />}
      {data.game && <Game data={data} game={data.game} call={call} busy={busy} creds={creds} remaining={remaining} />}
      {!data.game && data.session.status === 'finished' && <WaitCard text="This session has ended. Thank you for playing!" />}
    </main>
  );
}

const errText = (c: string) => ({ checkpoint_pending: 'Answer the checkpoint first.', session_not_active: 'The activity is not running right now.', session_finished: 'Time is up!', game_over: 'This game is over.', conflict: 'Please try again.' } as Record<string, string>)[c] ?? 'Something went wrong. Please try again.';
const Center = ({ children }: { children: React.ReactNode }) => <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">{children}</main>;
const WaitCard = ({ text }: { text: string }) => <Card><CardContent className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-amber-400" /><p>{text}</p></CardContent></Card>;

function JoinForm({ code, onJoined }: { code: string; onJoined: (c: Creds) => void }) {
  const [name, setName] = React.useState(''); const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api<{ participantId: string; token: string; name: string }>('/api/join', { body: { code, name } }); onJoined({ pid: r.participantId, token: r.token, name: r.name }); }
    catch (x) { setErr(x instanceof ApiError ? ({ session_not_found: 'Session code not found.', session_finished: 'This session has ended.', name_required: 'Please enter a name.', session_full: 'This session is full.' } as Record<string, string>)[x.code] ?? 'Could not join.' : 'Network error.'); }
    finally { setBusy(false); }
  };
  return (
    <Center>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="mx-auto h-24 w-24 rounded-full bg-cave-800 p-2"><div className="relative h-full w-full"><svg viewBox="0 0 100 100" aria-hidden className="h-full w-full"><circle cx="50" cy="50" r="40" fill="#f59e0b" /></svg></div></div>
        <h1 className="text-3xl font-black">Wumpus World</h1>
        <p className="text-slate-300">Think Like an AI Agent</p>
        <div className="rounded-xl bg-cave-800 p-2 text-sm">Session <b className="tracking-widest text-amber-300">{code.toUpperCase()}</b></div>
        <label className="block text-start text-sm font-semibold">Your display name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus autoComplete="nickname" placeholder="e.g. Sara" className="mt-1 h-14 w-full rounded-xl border border-cave-600 bg-cave-900 px-4 text-lg outline-none focus:border-amber-400" />
        </label>
        {err && <p role="alert" className="text-red-300">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : 'Join the cave'}</Button>
      </form>
    </Center>
  );
}

function Header({ data, remaining, online }: { data: Payload; remaining: number; online: boolean }) {
  const g = data.game;
  return (
    <header className="sticky top-0 z-30 -mx-2 rounded-b-2xl border-b border-cave-700 bg-cave-950/95 px-3 py-2 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0"><h1 className="truncate text-base font-black leading-tight">Wumpus World <span className="font-medium text-slate-400">· Think Like an AI Agent</span></h1><p className="truncate text-xs text-slate-300">{data.me.name}</p></div>
        <div className="flex items-center gap-2 text-sm font-bold">
          {online ? <Wifi className="h-4 w-4 text-emerald-400" aria-label="Online" /> : <WifiOff className="h-4 w-4 text-red-400" aria-label="Offline, reconnecting" />}
          <span className={cn('flex items-center gap-1 rounded-lg px-2 py-1', remaining < 60 && data.session.status === 'active' ? 'bg-red-900' : 'bg-cave-800')}><Clock className="h-4 w-4" aria-hidden />{fmtTime(remaining)}</span>
        </div>
      </div>
      {g && <div className="mt-1 flex items-center gap-2 text-xs text-slate-300"><Badge tone={g.mode === 'guided' ? 'blue' : 'amber'}>{g.mode === 'guided' ? <GraduationCap className="h-3 w-3" /> : <Swords className="h-3 w-3" />}{g.mode === 'guided' ? 'Guided Learning' : 'Challenge'}</Badge>
        <span>Checkpoints: <b>{g.checkpointsDone}</b></span><span>Squares: <b>{g.cells.filter((c) => c.visited).length}/16</b></span><span className="ms-auto">Score <b>{g.score}</b></span></div>}
    </header>
  );
}

function Game({ data, game, call, busy, creds, remaining }: { data: Payload; game: StudentGameView; call: (p: string, b: unknown) => Promise<Payload | null>; busy: boolean; creds: Creds; remaining: number }) {
  const [marks, setMarks] = React.useState<Record<string, Label[]>>({});
  const [sel, setSel] = React.useState<Pos | null>(null);
  const [mcq, setMcq] = React.useState<string | null>(null);
  const [freeMode, setFreeMode] = React.useState(false);
  const [hl, setHl] = React.useState<{ s: Pos[]; e: Pos[] }>({ s: [], e: [] });
  const [opt, setOpt] = React.useState<{ x: number; y: number; dir: string } | null>(null);
  React.useEffect(() => { setOpt(null); }, [game.seq, game.agent.x, game.agent.y, game.agent.dir]);
  const pend = game.pending;
  const inferRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { if (pend) setTimeout(() => inferRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }, [pend?.id]);
  const active = data.session.status === 'active';
  React.useEffect(() => { setMarks({}); setSel(null); setMcq(null); }, [pend?.id]);
  const labelsAllowed: Label[] = pend?.type === 'map' ? TASK_LABELS[pend.taskMode ?? 'full'] : freeMode ? TASK_LABELS.full : [];
  const mapMode = !!labelsAllowed.length && !game.over;

  const toggleLabel = (l: Label) => {
    if (!sel) return; const k = `${sel.x},${sel.y}`; const cur = marks[k] ?? [];
    const next: Label[] = (() => {
      if (l === 'unknown') return [];
      if (cur.includes(l)) return cur.filter((x) => x !== l);
      if (l === 'safe') return ['safe'];
      let base = cur.filter((x) => x !== 'safe');
      if (l.endsWith('pit')) base = base.filter((x) => !x.endsWith('pit'));
      if (l.endsWith('wumpus')) base = base.filter((x) => !x.endsWith('wumpus'));
      return [...base, l];
    })();
    setMarks({ ...marks, [k]: next });
  };
  const submit = async () => {
    if (!pend && !freeMode) return;
    const body = pend ? (pend.type === 'mcq' ? { checkpointId: pend.id, optionId: mcq } : { checkpointId: pend.id, marks }) : { checkpointId: 'fc', marks };
    const d = await call('/api/play/checkpoint', body);
    if (d) { setFreeMode(false); setMarks({}); setSel(null); }
  };
  const act = (a: string) => {
    if (busy) return;
    setHl({ s: [], e: [] });
    // instant (optimistic) feedback; the server stays authoritative and the real state replaces this
    const o = opt ?? { x: game.agent.x, y: game.agent.y, dir: game.agent.dir };
    const order = ['E', 'N', 'W', 'S'];
    if (a === 'turn_left') setOpt({ ...o, dir: order[(order.indexOf(o.dir) + 1) % 4] });
    else if (a === 'turn_right') setOpt({ ...o, dir: order[(order.indexOf(o.dir) + 3) % 4] });
    else if (a === 'forward') { const v = ({ E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] } as Record<string, number[]>)[o.dir]; const nx = o.x + v[0], ny = o.y + v[1]; if (nx >= 1 && nx <= 4 && ny >= 1 && ny <= 4) setOpt({ ...o, x: nx, y: ny }); }
    call('/api/play/action', { action: a }).then((d) => { if (!d) setOpt(null); });
  };
  const showSquares = (s: Pos[], e: Pos[]) => { setHl({ s, e }); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => setHl({ s: [], e: [] }), 5000); };
  const canAct = active && !game.over && !pend;

  return (
    <>
      <CaveGrid cells={game.cells} agent={{ ...game.agent, ...(opt ?? {}) }} world={game.world} marks={mapMode ? marks : {}} highlight={hl.s} eliminated={hl.e} selected={mapMode ? sel : null}
        wumpusDead={!game.agent.wumpusAlive} goldTaken={game.agent.hasGold}
        onCellClick={mapMode ? (p) => setSel(p) : undefined} clickable={(c) => mapMode && !c.visited} />
      <AnimatePresence>{game.over && <Ending game={game} creds={creds} call={call} active={active} />}</AnimatePresence>

      {!game.over && (
        <section aria-label="Actions" className="sticky bottom-2 z-20 rounded-2xl border border-cave-600 bg-cave-900/95 p-2 shadow-xl backdrop-blur">
          <div className="grid grid-cols-7 gap-1">
            <ActBtn icon={<RotateCcw />} label="Left" onClick={() => act('turn_left')} disabled={!canAct} />
            <ActBtn icon={<ArrowUp style={{ transform: `rotate(${({ E: 90, N: 0, W: -90, S: 180 } as Record<string, number>)[(opt ?? game.agent).dir]}deg)`, transition: 'transform .3s' }} />} label="Forward" onClick={() => act('forward')} disabled={!canAct} primary wide />
            <ActBtn icon={<RotateCw />} label="Right" onClick={() => act('turn_right')} disabled={!canAct} />
            <ActBtn icon={<Hand />} label="Grab" onClick={() => act('grab')} disabled={!canAct} />
            <ActBtn icon={<Crosshair />} label={game.agent.hasArrow ? 'Shoot' : 'No arrow'} onClick={() => act('shoot')} disabled={!canAct || !game.agent.hasArrow} />
            <ActBtn icon={<DoorOpen />} label="Climb" onClick={() => act('climb')} disabled={!canAct} />
          </div>
          <p className="mt-1 text-center text-xs text-slate-300">Facing <b className="text-cyan-300">{({ E: 'East →', N: 'North ↑', W: 'West ←', S: 'South ↓' } as Record<string, string>)[(opt ?? game.agent).dir]}</b> · Score {game.score} · Gold {game.agent.hasGold ? '✔ carried' : 'not yet'}{!active ? ' · on hold' : ''}</p>
        </section>
      )}

      <Card><CardHeader><CardTitle>What does the agent perceive?</CardTitle></CardHeader><CardContent><PerceptStrip p={game.percepts as unknown as Record<string, boolean>} /></CardContent></Card>

      {!game.over && (
        <Card ref={inferRef as any} className={cn(pend && 'border-amber-500 shadow-amber-500/20')}><CardHeader><CardTitle>What can the agent infer?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pend ? (<>
              <p className="font-semibold">{pend.prompt}</p>{pend.hint && <p className="text-sm text-slate-300">💡 {pend.hint}</p>}
              {pend.type === 'mcq' && (<div role="radiogroup" className="space-y-2">{pend.options!.map((o) => (
                <button key={o.id} role="radio" aria-checked={mcq === o.id} onClick={() => setMcq(o.id)} className={cn('min-h-[52px] w-full rounded-xl border-2 px-4 py-3 text-start font-medium transition', mcq === o.id ? 'border-amber-400 bg-amber-500/20' : 'border-cave-600 bg-cave-800')}>{o.text}</button>))}</div>)}
              {pend.type === 'map' && <MapLabeler allowed={labelsAllowed} sel={sel} marks={marks} onToggle={toggleLabel} />}
              <Button size="lg" className="w-full" disabled={busy || (pend.type === 'mcq' ? !mcq : false)} onClick={submit}>{busy ? <Loader2 className="animate-spin" /> : 'Check My Inference'}</Button>
            </>) : freeMode ? (<>
              <p className="font-semibold">Label what the agent can justify for each unexplored square.</p>
              <MapLabeler allowed={labelsAllowed} sel={sel} marks={marks} onToggle={toggleLabel} />
              <div className="flex gap-2"><Button size="lg" className="flex-1" disabled={busy} onClick={submit}>Check My Inference</Button><Button variant="outline" size="lg" onClick={() => setFreeMode(false)}>Cancel</Button></div>
            </>) : (<>
              {game.feedback && <Feedback game={game} data={data} onShow={showSquares} />}
              {game.mode === 'challenge' && !game.feedback && <p className="text-sm text-slate-300">Challenge mode: no hints. Explore, and mark what you believe whenever you want to test your reasoning.</p>}
              {game.mode === 'guided' && !game.feedback && <p className="text-sm text-slate-300">Move the agent. A checkpoint appears when there is something important to work out.</p>}
              {(game.mode === 'challenge' || game.feedback) && <Button variant="secondary" className="w-full" onClick={() => { setFreeMode(true); setSel(null); }}>Mark what the agent knows</Button>}
            </>)}
          </CardContent></Card>
      )}

      <Thinking game={game} onShow={showSquares} />
      <KnowledgePanel game={game} />
      <LogicSection records={game.records} available={data.logic.available} enabled={data.logic.enabled} view={data.logic.view} onShow={showSquares} />
      <div className="sr-only" aria-live="polite">{game.feedback?.summary}</div>
    </>
  );
}

const ActBtn = ({ icon, label, onClick, disabled, primary, wide }: { icon: React.ReactNode; label: string; onClick: () => void; disabled: boolean; primary?: boolean; wide?: boolean }) => (
  <Button variant={primary ? 'default' : 'secondary'} onClick={onClick} disabled={disabled}
    className={cn('h-14 flex-col gap-0.5 px-0 text-[11px] leading-tight [&>svg]:h-5 [&>svg]:w-5', wide && 'col-span-2 h-14 text-sm')}>{icon}<span>{label}</span></Button>
);

function MapLabeler({ allowed, sel, marks, onToggle }: { allowed: Label[]; sel: Pos | null; marks: Record<string, Label[]>; onToggle: (l: Label) => void }) {
  const cur = sel ? marks[`${sel.x},${sel.y}`] ?? [] : [];
  return (
    <div className="rounded-xl bg-cave-800 p-3">
      <p className="mb-2 text-sm font-semibold">{sel ? <>Selected square <span className="font-mono text-amber-300">[{sel.x},{sel.y}]</span> — what does the agent know?</> : '👆 Tap an unexplored square on the map above.'}</p>
      <div className="grid grid-cols-2 gap-2">
        {[...allowed, 'unknown' as Label].map((l) => {
          const on = l === 'unknown' ? !!sel && cur.length === 0 : cur.includes(l);
          return <button key={l} disabled={!sel} onClick={() => onToggle(l)} aria-pressed={on} className={cn('min-h-[48px] rounded-xl border-2 px-2 text-sm font-bold transition disabled:opacity-40', on ? 'border-white ' + LABEL_META[l].cls : 'border-cave-600 bg-cave-900')}>{LABEL_META[l].text}</button>;
        })}
      </div>
    </div>
  );
}

function Feedback({ game, data, onShow }: { game: StudentGameView; data: Payload; onShow: (s: Pos[], e: Pos[]) => void }) {
  const f = game.feedback!; const recs = game.records.filter((r) => r.step === f.recordStep);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-xl border-2 p-3', f.correct ? 'border-emerald-500 bg-emerald-950/50' : 'border-red-500 bg-red-950/40')} role="status">
      <p className="flex items-center gap-2 font-bold">{f.correct ? <CheckCircle2 className="text-emerald-400" /> : <XCircle className="text-red-400" />}{f.correct ? 'Correct reasoning' : 'Not quite'}</p>
      <p className="mt-1">{f.summary}</p>
      {f.details.length > 0 && <ul className="mt-1 list-disc ps-5 text-sm text-slate-200">{f.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      {recs.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2 text-sm">
          <p className="font-bold text-amber-300">Why? The agent&apos;s reasoning:</p>
          <ol className="mt-1 space-y-2">{recs.filter((r) => r.kind !== 'safe').concat(recs.filter((r) => r.kind === 'safe')).map((r) => (
            <li key={r.id}>{r.observation && <span className="text-sky-200">{r.observation.text} </span>}{r.previous.slice(0, 2).map((p, i) => <span key={i} className="text-slate-300">{p.text} </span>)}<b>→ {r.inference.text}</b> <button className="ms-1 rounded bg-cave-700 px-2 text-xs font-bold" onClick={() => onShow(r.squares, r.eliminated.map((e) => e.pos))}>show</button></li>))}</ol>
          {data.logic.available && <p className="mt-2 text-xs text-slate-400">Open “Behind the Agent’s Reasoning: Logical Rules” at the bottom to see the formal version.</p>}
        </div>)}
    </motion.div>
  );
}

function Thinking({ game, onShow }: { game: StudentGameView; onShow: (s: Pos[], e: Pos[]) => void }) {
  const reduce = useReducedMotion(); const [open, setOpen] = React.useState(false);
  const locked = !!game.pending;
  return (
    <Collapsible title="How Does the Agent Think?" icon={<Brain className="h-5 w-5 text-sky-300" />} open={open} onOpenChange={setOpen}>
      {locked ? <p className="text-sm text-slate-300">Answer the checkpoint first — then you can compare with how the agent reasons.</p> : (
        <ol className="space-y-2">{game.thinking.map((t, i) => (
          <motion.li key={`${game.seq}-${t.title}`} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : i * 0.45 }}>
            <button onClick={() => onShow(t.squares, [])} className="flex w-full items-start gap-3 rounded-xl bg-cave-800 p-3 text-start active:bg-cave-700">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-black">{i + 1}</span>
              <span><b className="block text-sky-200">{t.title}</b><span className="text-sm">{t.text}</span></span>
            </button></motion.li>))}</ol>)}
    </Collapsible>
  );
}

function KnowledgePanel({ game }: { game: StudentGameView }) {
  const kb = game.kb;
  const Row = ({ title, items, tone }: { title: string; items: string[]; tone: string }) => (
    <div><p className="text-xs font-bold uppercase text-slate-400">{title}</p>{items.length ? <p className="flex flex-wrap gap-1">{items.map((i) => <span key={i} className={cn('rounded px-1.5 py-0.5 font-mono text-xs font-bold', tone)}>{i}</span>)}</p> : <p className="text-sm text-slate-500">none</p>}</div>);
  return (
    <Collapsible title="Agent Knowledge Base" icon={<Library className="h-5 w-5 text-emerald-300" />}>
      <div className="space-y-3">
        <Row title="Known safe squares" items={kb.safe} tone="bg-emerald-700" />
        <Row title="Possible Pits" items={kb.possiblePits} tone="bg-orange-500 text-black" />
        <Row title="Confirmed Pits" items={kb.confirmedPits} tone="bg-red-600" />
        <Row title="Possible Wumpus squares" items={kb.possibleWumpus} tone="bg-fuchsia-500 text-black" />
        <Row title="Confirmed Wumpus" items={kb.confirmedWumpus} tone="bg-red-700" />
        {kb.wumpusDead && <p className="text-sm text-emerald-300">☠ The Wumpus is dead.</p>}
        <div><p className="text-xs font-bold uppercase text-slate-400">Previous observations</p><ul className="text-sm">{kb.observations.map((o) => <li key={o} className="font-mono text-xs">{o}</li>)}</ul></div>
        <div><p className="text-xs font-bold uppercase text-slate-400">Current conclusions</p>{kb.conclusions.length ? <ul className="list-disc ps-5 text-sm">{kb.conclusions.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p className="text-sm text-slate-500">none yet</p>}</div>
      </div>
    </Collapsible>
  );
}

function Ending({ game, creds, call, active }: { game: StudentGameView; creds: Creds; call: (p: string, b: unknown) => Promise<Payload | null>; active: boolean }) {
  const [report, setReport] = React.useState<any>(null); const [replay, setReplay] = React.useState<any>(null);
  React.useEffect(() => { api('/api/play/report', { pid: creds.pid, token: creds.token }).then(setReport).catch(() => {}); api('/api/play/replay', { pid: creds.pid, token: creds.token }).then(setReplay).catch(() => {}); }, [creds, game.id]);
  const title = ({ won: '🏆 You escaped with the gold!', escaped_no_gold: 'You climbed out without the gold', dead: game.deathCause === 'pit' ? '🕳️ The agent fell into a Pit' : '👹 The Wumpus got the agent', timeout: '⏱ Time is up' } as Record<string, string>)[game.outcome];
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3">
      <Card className="border-amber-500"><CardContent className="text-center"><Trophy className="mx-auto h-8 w-8 text-amber-400" aria-hidden /><h2 className="mt-1 text-xl font-black">{title}</h2><p className="text-sm text-slate-300">The actual hidden map is now revealed above. Game score: <b>{game.score}</b></p></CardContent></Card>
      <Card><CardHeader><CardTitle>Your Agent Reasoning Report</CardTitle></CardHeader><CardContent className="space-y-3">
        {!report ? <Loader2 className="animate-spin" /> : (<>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[['Percepts encountered', report.perceptsEncountered], ['Correct inferences', report.correctInferences], ['Incorrect inferences', report.incorrectInferences], ['Safe decisions', report.safeDecisions], ['Risky decisions', report.riskyDecisions], ['Reasoning accuracy', `${report.reasoningAccuracy}%`]].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-cave-800 p-2"><div className="text-2xl font-black text-amber-300">{v}</div><div className="text-xs text-slate-300">{k}</div></div>))}
          </div>
          <ul className="list-disc space-y-1 ps-5 text-sm">{report.feedback.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
        </>)}
      </CardContent></Card>
      {replay && <Collapsible title="Replay your decisions & compare with correct reasoning" defaultOpen={game.mode === 'challenge'}><Replay events={replay.events} records={replay.records} world={replay.world} allowReveal={false} /></Collapsible>}
      {active && <Button size="lg" className="w-full" onClick={() => call('/api/play/start', {})}>Play another random world</Button>}
    </motion.div>
  );
}
