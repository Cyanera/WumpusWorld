'use client';
import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen, Lock, Eye, ChevronDown } from 'lucide-react';
import { Collapsible } from '../ui/collapsible';
import { Badge } from '../ui/badge';
import { Tex } from './Tex';
import type { InferenceRecord } from '@/lib/engine/reasoner';
import { SYMBOL_LEGEND, clauseTex, litTex } from '@/lib/engine/formal';
import type { Pos } from '@/lib/engine/types';

type View = 'natural' | 'formal' | 'both';
const CERTAIN: Record<string, { label: string; tone: 'green' | 'amber' | 'blue' }> = {
  breeze: { label: 'Possibility — not proven', tone: 'amber' }, stench: { label: 'Possibility — not proven', tone: 'amber' },
};

export function Legend() {
  return (
    <details className="rounded-lg bg-cave-800 p-2 text-sm">
      <summary className="cursor-pointer font-semibold">Symbol legend</summary>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {SYMBOL_LEGEND.map((s) => (<li key={s.sym} className="flex items-center gap-2"><span className="min-w-[72px] rounded bg-cave-950 px-2 py-0.5 text-center"><Tex tex={s.tex} /></span><span className="text-slate-300">{s.meaning}</span></li>))}
      </ul>
    </details>
  );
}

/** Eliminated hypotheses are shown struck-through with an animation. */
function EliminatedList({ rec }: { rec: InferenceRecord }) {
  if (!rec.eliminated.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-400">Eliminated:</span>
      {rec.eliminated.map((e) => (
        <span key={`${e.what}${e.pos.x}${e.pos.y}`} className="strike-anim rounded bg-red-950/60 px-2 py-0.5"><Tex tex={litTex({ p: e.what === 'pit' ? 'P' : 'W', x: e.pos.x, y: e.pos.y })} /></span>
      ))}
    </div>
  );
}

const NATURAL: Record<string, string> = {
  '1': 'A Breeze is felt in a square exactly when at least one neighbouring square contains a Pit.',
  '2': 'If no Breeze is felt, none of the neighbouring squares contains a Pit.',
  '3': 'While the Wumpus is alive, a Stench is smelled exactly when the Wumpus is in a neighbouring square.',
  '4': 'While the Wumpus is alive, if no Stench is smelled, none of the neighbouring squares holds the Wumpus.',
  '5': 'A square is safe when it contains neither a Pit nor a living Wumpus.',
  '6': 'Combine an earlier possibility with a new observation: when all other options are eliminated, the remaining one must be true.',
  '7': 'Combine the Stench possibilities with earlier No-Stench observations: the Wumpus can only be where nothing rules it out.',
};
const naturalRule = (r: InferenceRecord) => NATURAL[r.ruleName.match(/Rule (\d)/)?.[1] ?? ''] ?? r.ruleFormal.text;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="grid grid-cols-[92px_1fr] gap-2 border-t border-cave-700 py-1.5 first:border-0"><div className="text-[11px] font-bold uppercase tracking-wide text-amber-300">{label}</div><div className="min-w-0 text-sm">{children}</div></div>);
}

export function RecordCard({ rec, view, onShow, defaultOpen = false }: { rec: InferenceRecord; view: View; onShow?: (s: Pos[], e: Pos[]) => void; defaultOpen?: boolean }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(defaultOpen);
  const cert = CERTAIN[rec.kind] ?? { label: 'Logically entailed', tone: 'green' as const };
  const showN = view !== 'formal', showF = view !== 'natural';
  const conclusionTex = rec.entail.conclusion.length ? rec.entail.conclusion.map((c) => (c.length > 1 ? `(${clauseTex(c)})` : clauseTex(c))).join(' \\land ') : rec.inference.tex;
  const kbTex = rec.entail.kb.length ? `\\{${rec.entail.kb.map((c) => clauseTex(c)).join(',\\ ')}\\}` : '\\emptyset';
  return (
    <motion.article initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-cave-600 bg-cave-950/60 p-3">
      <header className="mb-1 flex flex-wrap items-center gap-2">
        <Badge tone="violet">{rec.ruleName}</Badge><Badge tone={cert.tone}>{cert.label}</Badge>
        <button className="ms-auto flex items-center gap-1 rounded-lg bg-cave-700 px-2 py-1 text-xs font-bold" onClick={() => onShow?.(rec.squares, rec.eliminated.map((e) => e.pos))}><Eye className="h-3.5 w-3.5" />Show on map</button>
      </header>
      {rec.observation && <Row label="Observation"><span className="mb-0.5 block text-[11px] text-sky-300">observed percept</span>{showN && <p>{rec.observation.text}</p>}{showF && <Tex tex={rec.observation.tex} />}</Row>}
      <Row label="Knowledge">
        {rec.previous.length === 0 ? <span className="text-slate-400">Nothing earlier was needed.</span> : (
          <ul className="space-y-1">{rec.previous.map((p, i) => (<li key={i}>{showN && <span className="block">{p.text}</span>}{showF && <Tex tex={p.tex} />}</li>))}</ul>)}
      </Row>
      <Row label="Logical rule">{showN && <p className="mb-0.5">{naturalRule(rec)}</p>}{showF && <Tex tex={rec.ruleFormal.tex} />}</Row>
      <Row label="Inference">{showN && <p className="font-semibold">{rec.inference.text}</p>}{showF && <Tex tex={rec.inference.tex} />}<EliminatedList rec={rec} /></Row>
      <Row label="KB update"><p>{rec.update}</p></Row>
      {rec.assumptions.length > 0 && <p className="mt-1 text-xs text-slate-400">Assumption: {rec.assumptions.join(' ')}</p>}
      <button className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-300" aria-expanded={open} onClick={() => setOpen(!open)}>
        Why does this conclusion follow? <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-cave-800 p-2 text-sm">
          <p>An inference is logically valid when its conclusion must be true whenever the available knowledge is true.</p>
          <div className="my-2 text-center"><Tex block tex={`\\mathrm{KB} \\models \\alpha`} /></div>
          <p className="text-slate-300">KB = the agent&apos;s Knowledge Base, α = the inferred conclusion, ⊨ = logically entails. <span className="text-slate-400">(Preview for the next lecture — no exercise needed.)</span></p>
          {rec.entail.conclusion.length > 0 && <div className="mt-2"><Tex tex={`\\mathrm{KB}=${kbTex}`} /><div className="mt-1"><Tex tex={`\\mathrm{KB} \\models ${conclusionTex}`} /></div></div>}
        </div>
      )}
    </motion.article>
  );
}

export function LogicSection({ records, available, enabled, view, onShow }: { records: InferenceRecord[]; available: boolean; enabled: boolean; view: View; onShow: (s: Pos[], e: Pos[]) => void }) {
  const list = records.filter((r) => r.kind !== 'wumpus_dead' || true).slice().reverse();
  return (
    <Collapsible title="Behind the Agent's Reasoning: Logical Rules" icon={available ? <BookOpen className="h-5 w-5 text-amber-300" /> : <Lock className="h-5 w-5 text-slate-500" />}
      badge={available ? <Badge tone="violet">{records.length}</Badge> : undefined}>
      {!enabled ? <p className="text-sm text-slate-300">Your instructor will open this section after the activity.</p>
        : !available ? <p className="text-sm text-slate-300">This section unlocks after you complete your first reasoning checkpoint. It shows how the agent&apos;s thinking looks as formal logic — your preview of the next lecture.</p>
        : (<div className="space-y-3">
          <p className="text-sm text-slate-300">Each card is generated from <b>your</b> game: the exact percepts and squares the agent used.</p>
          <Legend />
          {list.length === 0 ? <p className="text-sm text-slate-400">No inferences yet.</p> : list.map((r, i) => <RecordCard key={r.id} rec={r} view={view} onShow={onShow} defaultOpen={false} />)}
        </div>)}
    </Collapsible>
  );
}
