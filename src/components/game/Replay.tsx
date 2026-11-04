'use client';
import * as React from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Eye, EyeOff, Brain } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CaveGrid, GridCell } from './CaveGrid';
import { RecordCard } from './LogicSection';
import type { InferenceRecord } from '@/lib/engine/reasoner';
import { expand } from '@/lib/engine/reasoner';
import { Pos } from '@/lib/engine/types';
import { LabelChip } from '../art/Labels';
import { PerceptStrip } from './Percepts';

export interface ReplayEvent { seq: number; kind: string; payload: any }
export interface ReplayProps {
  events: ReplayEvent[]; records: InferenceRecord[]; world: { pits: Pos[]; wumpus: Pos; gold: Pos } | null;
  allowReveal?: boolean; large?: boolean; logicView?: 'natural' | 'formal' | 'both'; autoPlay?: boolean; onRecordSelect?: (r: InferenceRecord) => void;
  showReasoningDefault?: boolean;
}
const ACTION_TEXT: Record<string, string> = { turn_left: 'Turn Left', turn_right: 'Turn Right', forward: 'Move Forward', grab: 'Grab', shoot: 'Shoot', climb: 'Climb' };

export function describeEvent(e: ReplayEvent): string {
  const p = e.payload;
  if (e.kind === 'start') return `Agent enters [1,1]`;
  if (e.kind === 'end') return `Time is up — ${p.agent.outcome}`;
  if (e.kind === 'checkpoint') return `Checkpoint: ${p.checkpoint?.kind?.replace(/_/g, ' ')} — ${p.correct ? 'correct' : 'incorrect'}`;
  const a = p.agent;
  return `${ACTION_TEXT[p.action] ?? p.action} → [${a.x},${a.y}]${!a.alive ? ' ☠ died' : a.outcome === 'won' ? ' ✔ escaped with gold' : a.outcome === 'escaped_no_gold' ? ' (left without gold)' : ''}`;
}

/** Rebuild the grid for step i purely from recorded events (percept history + reasoner snapshot). */
export function replayCells(events: ReplayEvent[], i: number): { cells: GridCell[]; goldTaken: boolean } {
  const p = events[Math.min(i, events.length - 1)].payload;
  const seen = new Map<string, { breeze: boolean; stench: boolean; glitter: boolean }>();
  for (const e of events.slice(0, i + 1)) {
    const a = e.payload.agent; if (!a || (e.kind !== 'start' && e.kind !== 'action') || !a.alive) continue;
    const k = `${a.x},${a.y}`; if (!seen.has(k)) seen.set(k, { breeze: e.payload.percepts.breeze, stench: e.payload.percepts.stench, glitter: false });
    if (e.payload.percepts.glitter) seen.set(k, { ...seen.get(k)!, glitter: true });
  }
  const know = expand(p.truth, p.truthWumpusDead);
  const cells: GridCell[] = know.cells.map((c) => {
    const pc = seen.get(`${c.x},${c.y}`);
    return { x: c.x, y: c.y, visited: c.visited, breeze: !!pc?.breeze, stench: !!pc?.stench, glitter: !!pc?.glitter && !p.agent.hasGold && c.x === p.agent.x && c.y === p.agent.y, safe: c.safe, pit: c.pit, wumpus: c.wumpus };
  });
  return { cells, goldTaken: !!p.agent.hasGold };
}

export function Replay({ events, records, world, allowReveal = true, large = false, logicView = 'both', autoPlay = false, showReasoningDefault = true, onRecordSelect }: ReplayProps) {
  const [i, setI] = React.useState(0);
  const [play, setPlay] = React.useState(autoPlay);
  const [reveal, setReveal] = React.useState(false);
  const [reason, setReason] = React.useState(showReasoningDefault);
  const [hl, setHl] = React.useState<{ s: Pos[]; e: Pos[] }>({ s: [], e: [] });
  const n = events.length;
  React.useEffect(() => { setI(0); setPlay(autoPlay); }, [events, autoPlay]);
  React.useEffect(() => {
    if (!play) return;
    if (i >= n - 1) { setPlay(false); return; }
    const t = setTimeout(() => setI((x) => Math.min(n - 1, x + 1)), large ? 1800 : 1200);
    return () => clearTimeout(t);
  }, [play, i, n, large]);
  React.useEffect(() => setHl({ s: [], e: [] }), [i]);
  if (!n) return <p className="text-slate-400">No recorded events.</p>;
  const ev = events[Math.min(i, n - 1)]; const p = ev.payload;
  const { cells, goldTaken } = replayCells(events, i);
  const recs = records.filter((r) => (p.recordIds ?? []).includes(r.id));
  const cp = p.checkpoint;
  const ending = i === n - 1 && p.agent.outcome !== 'playing';
  return (
    <div className={large ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'grid gap-3 md:grid-cols-2'}>
      <div>
        <CaveGrid cells={cells} agent={p.agent} world={reveal || ending ? world : null} highlight={hl.s} eliminated={hl.e} wumpusDead={!p.agent.wumpusAlive} goldTaken={goldTaken} />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2" dir="ltr">
          <Button size="icon" variant="secondary" aria-label="Previous step" onClick={() => { setPlay(false); setI(Math.max(0, i - 1)); }}><ChevronLeft /></Button>
          <Button size="icon" aria-label={play ? 'Pause' : 'Play'} onClick={() => { if (i >= n - 1) setI(0); setPlay(!play); }}>{play ? <Pause /> : <Play />}</Button>
          <Button size="icon" variant="secondary" aria-label="Next step" onClick={() => { setPlay(false); setI(Math.min(n - 1, i + 1)); }}><ChevronRight /></Button>
          <Button size="icon" variant="ghost" aria-label="Reset" onClick={() => { setPlay(false); setI(0); }}><RotateCcw /></Button>
          <Button size="sm" variant="outline" onClick={() => setReason(!reason)}>{reason ? <EyeOff className="h-4 w-4" /> : <Brain className="h-4 w-4" />}{reason ? 'Hide reasoning' : 'Show reasoning'}</Button>
          {allowReveal && <Button size="sm" variant="outline" onClick={() => setReveal(!reveal)}>{reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{reveal ? 'Hide actual map' : 'Reveal actual map'}</Button>}
        </div>
        <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlay(false); setI(+e.target.value); }} className="mt-3 w-full accent-amber-500" aria-label="Timeline" dir="ltr" />
        <p className="text-center text-xs text-slate-400" dir="ltr">Step {i + 1} / {n}</p>
      </div>
      <div className="min-w-0 space-y-3" dir="ltr">
        <div className="rounded-xl bg-cave-800 p-3">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="amber">{ev.kind}</Badge><b className={large ? 'text-xl' : ''}>{describeEvent(ev)}</b></div>
          <p className="mt-1 text-sm text-slate-300">Game score: <b>{p.agent.score}</b>{p.risky ? <span className="ms-2 text-red-300">⚠ Risky: {p.riskReason}</span> : p.risky === false ? <span className="ms-2 text-emerald-300">✓ justified move</span> : null}</p>
          <div className="mt-2"><PerceptStrip p={p.percepts} compact /></div>
        </div>
        {reason && cp && (
          <div className="rounded-xl border border-cave-600 bg-cave-900 p-3 text-sm">
            <p className="font-bold">{cp.prompt}</p>
            <p className={p.correct ? 'text-emerald-300' : 'text-red-300'}>{p.correct ? 'Student answered correctly.' : 'Student answered incorrectly.'}</p>
            {p.evaluation?.cellResults?.length > 0 && (
              <ul className="mt-1 space-y-1">{p.evaluation.cellResults.map((r: any) => (
                <li key={`${r.x}${r.y}`} className="flex flex-wrap items-center gap-1">
                  <span className="font-mono">[{r.x},{r.y}]</span> {r.ok ? '✓' : '✗'} student: {r.given.length ? r.given.map((l: any) => <LabelChip key={l} label={l} />) : <i className="text-slate-400">nothing</i>} · correct: {r.expected.length ? r.expected.map((l: any) => <LabelChip key={l} label={l} />) : <i className="text-slate-400">nothing</i>}
                </li>))}</ul>)}
            {p.answer?.optionId && <p>Chose option <b>{p.answer.optionId.toUpperCase()}</b> (correct: {cp.options?.find((o: any) => o.correct)?.id?.toUpperCase()}).</p>}
          </div>
        )}
        {reason && recs.length > 0 && recs.map((r) => (
          <div key={r.id} onClick={() => onRecordSelect?.(r)}><RecordCard rec={r} view={logicView} onShow={(s, e) => setHl({ s, e })} /></div>))}
        {reason && !recs.length && !cp && <p className="text-sm text-slate-400">No new inference at this step.</p>}
        <details className="rounded-xl bg-cave-900 p-2 text-sm"><summary className="cursor-pointer font-bold">All steps</summary>
          <ol className="mt-2 max-h-60 space-y-0.5 overflow-auto">{events.map((e, k) => (<li key={k}><button className={`w-full rounded px-2 py-1 text-start ${k === i ? 'bg-amber-500 text-black' : 'hover:bg-cave-700'}`} onClick={() => { setPlay(false); setI(k); }}>{k + 1}. {describeEvent(e)}</button></li>))}</ol>
        </details>
      </div>
    </div>
  );
}
