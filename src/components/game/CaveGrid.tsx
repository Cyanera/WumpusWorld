'use client';
import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Label, Pos } from '@/lib/engine/types';
import { AgentArt, BreezeFx, GlitterFx, GoldArt, PitArt, StenchFx, WumpusArt } from '../art/Art';
import { LabelChip } from '../art/Labels';
import { cn } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';

export interface GridCell {
  x: number; y: number; visited: boolean; breeze: boolean; stench: boolean; glitter: boolean; safe: boolean;
  pit: string; wumpus: string; // none | possible | confirmed | unknown
}
export interface CaveGridProps {
  cells: GridCell[];
  agent: { x: number; y: number; dir: string; alive: boolean };
  world?: { pits: Pos[]; wumpus: Pos; gold: Pos } | null; // only when legitimately revealed
  marks?: Record<string, Label[]>;                         // student's in-progress labels
  highlight?: Pos[];
  eliminated?: Pos[];
  selected?: Pos | null;
  onCellClick?: (p: Pos) => void;
  clickable?: (c: GridCell) => boolean;
  wumpusDead?: boolean;
  goldTaken?: boolean;
  className?: string;
}
const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

const ANG: Record<string, number> = { E: 0, N: -90, W: -180, S: -270 };

export function CaveGrid({ cells, agent, world, marks = {}, highlight = [], eliminated = [], selected, onCellClick, clickable, wumpusDead, goldTaken, className }: CaveGridProps) {
  const reduce = useReducedMotion();
  // cumulative angle so turns always rotate the short way (no 270° spin)
  const ang = React.useRef(ANG[agent.dir] ?? 0);
  { const target = ANG[agent.dir] ?? 0; let d = (((target - ang.current) % 360) + 540) % 360 - 180; if (d !== 0) ang.current += d; }
  const DV: Record<string, [number, number]> = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] };
  const front = { x: agent.x + (DV[agent.dir]?.[0] ?? 0), y: agent.y + (DV[agent.dir]?.[1] ?? 0) };
  const rows = [4, 3, 2, 1];
  const cols = [1, 2, 3, 4];
  const at = (x: number, y: number) => cells.find((c) => c.x === x && c.y === y)!;
  return (
    <div dir="ltr" className="mx-auto w-full max-w-[560px]">
    <div className="mb-0.5 flex items-center justify-between px-2 text-[11px] font-bold text-slate-400" aria-hidden><span>N ↑ (y up)</span><span>E → (x right)</span></div>
    <div className={cn('relative aspect-square w-full select-none rounded-3xl border-4 border-cave-600 bg-cave-950 p-1.5 shadow-2xl', className)}
      role="grid" aria-label="Cave map, 4 by 4. Coordinate [1,1] is bottom-left.">
      <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-1">
        {rows.flatMap((y) => cols.map((x) => {
          const c = at(x, y);
          const p = { x, y };
          const isAgent = same(agent, p);
          const rev = world ? { pit: world.pits.some((q) => same(q, p)), wumpus: same(world.wumpus, p), gold: same(world.gold, p) && !goldTaken } : null;
          const hl = highlight.some((q) => same(q, p));
          const elim = eliminated.some((q) => same(q, p));
          const m = marks[`${x},${y}`] ?? [];
          const canClick = !!onCellClick && (clickable ? clickable(c) : true);
          const showPit = c.pit === 'confirmed' || rev?.pit; const showPitFaded = c.pit === 'possible' && !showPit;
          const showW = (c.wumpus === 'confirmed' || rev?.wumpus); const showWFaded = c.wumpus === 'possible' && !showW;
          const unknownFog = !c.visited && !c.safe && !rev;
          return (
            <button key={`${x},${y}`} type="button" role="gridcell" disabled={!canClick}
              aria-label={`Square [${x},${y}]${c.visited ? ', visited' : c.safe ? ', known safe' : ', unexplored'}${c.breeze ? ', breeze' : ''}${c.stench ? ', stench' : ''}${c.glitter ? ', glitter' : ''}`}
              onClick={() => onCellClick?.(p)}
              className={cn(
                'relative overflow-hidden rounded-xl border text-start transition-[box-shadow,transform]',
                c.visited ? 'border-amber-900/50 bg-gradient-to-br from-stone-500 to-stone-700' : c.safe ? 'border-emerald-600/70 bg-gradient-to-br from-emerald-900/70 to-cave-800' : 'border-cave-700 bg-cave-800',
                canClick && 'cursor-pointer active:scale-[.96]', hl && 'ring-4 ring-cyan-300 z-10', selected && same(selected, p) && 'ring-4 ring-amber-400 z-10',
              )}>
              {/* floor texture */}
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 25%, #fff2 0 3px, transparent 4px), radial-gradient(circle at 75% 70%, #0004 0 5px, transparent 6px)' }} />
              {/* hazards */}
              {(showPit || showPitFaded) && <PitArt faded={showPitFaded} className={showPit && c.pit === 'confirmed' ? 'drop-shadow-[0_0_6px_rgba(248,113,113,.9)]' : ''} />}
              {(showW || showWFaded) && <div style={{ opacity: showWFaded ? 0.5 : 1 }} className="absolute inset-[6%]"><WumpusArt dead={!!wumpusDead} /></div>}
              {(rev?.gold || c.glitter) && <div className="absolute inset-[8%]"><GoldArt /></div>}
              {/* percept effects */}
              {c.visited && c.breeze && <BreezeFx />}
              {c.visited && c.stench && <StenchFx />}
              {c.glitter && <GlitterFx />}
              {/* fog of war */}
              {unknownFog && (<div className="fog absolute inset-0 bg-cave-950/60 backdrop-blur-[1px]" aria-hidden><span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-slate-400/60">?</span></div>)}
              {c.safe && !c.visited && !rev && <span className="absolute right-1 top-1 rounded-full bg-emerald-500 p-0.5 text-black shadow"><ShieldCheck className="h-3.5 w-3.5" aria-label="Known safe" /></span>}
              {elim && <span className="absolute inset-0 flex items-center justify-center text-4xl font-black text-red-400/90 fx-pop">✕</span>}
              {/* coordinate + hazard badges */}
              <span className="absolute bottom-0.5 left-1 text-[10px] font-bold text-white/70 drop-shadow">[{x},{y}]</span>
              <div className="absolute left-0.5 top-0.5 flex flex-wrap gap-0.5">
                {c.pit === 'possible' && <LabelChip label="possible_pit" />}{c.pit === 'confirmed' && <LabelChip label="confirmed_pit" />}
                {c.wumpus === 'possible' && <LabelChip label="possible_wumpus" />}{c.wumpus === 'confirmed' && <LabelChip label="confirmed_wumpus" />}
              </div>
              {m.length > 0 && <div className="absolute bottom-4 left-0.5 right-0.5 flex flex-wrap justify-center gap-0.5 rounded bg-black/60 p-0.5">{m.map((l) => <LabelChip key={l} label={l} />)}</div>}
              {same(front, p) && agent.alive && <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-cyan-400/25 px-2 text-3xl font-black leading-none text-cyan-200 ring-2 ring-cyan-300/60" style={{ transform: `rotate(${ANG[agent.dir]}deg)` }}>➤</span></span>}
              {c.visited && !isAgent && c.breeze && <span className="sr-only">Breeze here</span>}
            </button>
          );
        }))}
      </div>
      {/* the agent glides between squares */}
      <motion.div aria-hidden className="pointer-events-none absolute z-20"
        style={{ width: 'calc((100% - 12px - 12px) / 4)', height: 'calc((100% - 12px - 12px) / 4)' }}
        initial={false}
        animate={{ left: `calc(6px + ${(agent.x - 1)} * ((100% - 12px - 12px) / 4 + 4px))`, top: `calc(6px + ${(4 - agent.y)} * ((100% - 12px - 12px) / 4 + 4px))` }}
        transition={reduce ? { duration: 0 } : { duration: 0.32, ease: [0.4, 0, 0.2, 1] }}>
        <div className="absolute inset-[8%]"><AgentArt angle={ang.current} alive={agent.alive} /></div>
      </motion.div>
    </div>
    </div>
  );
}
