import {
  Knowledge, Label, LABELS, Mode, Pos, World, allCells, cellIndex, fmt, key, neighbors, Observation,
} from './types';
import { cellOf } from './reasoner';
import type { InferenceRecord } from './reasoner';

export type CheckpointKind =
  | 'meaning_breeze' | 'meaning_stench' | 'safe_clear' | 'possible_pit' | 'possible_wumpus'
  | 'elimination' | 'safe_combined' | 'confirmed_pit' | 'confirmed_wumpus' | 'free_check';
export type TaskMode = 'safe' | 'pit' | 'wumpus' | 'full';
export interface McqOption { id: string; text: string; correct?: boolean; misconception?: string }
export interface Checkpoint {
  id: string; kind: CheckpointKind; step: number; type: 'map' | 'mcq';
  prompt: string; hint?: string;
  taskMode?: TaskMode; labels?: Label[];
  options?: McqOption[];
}
export const TASK_LABELS: Record<TaskMode, Label[]> = {
  safe: ['safe'], pit: ['possible_pit', 'confirmed_pit'], wumpus: ['possible_wumpus', 'confirmed_wumpus'], full: LABELS.filter((l) => l !== 'unknown'),
};
export const CATEGORY_OF: Record<CheckpointKind, string> = {
  meaning_breeze: 'percept_understanding', meaning_stench: 'percept_understanding', safe_clear: 'safe_recognition',
  possible_pit: 'possible_pit', possible_wumpus: 'wumpus_identification', elimination: 'knowledge_integration',
  safe_combined: 'knowledge_integration', confirmed_pit: 'confirmed_pit', confirmed_wumpus: 'wumpus_identification', free_check: 'safe_recognition',
};

export const MISCONCEPTIONS: Record<string, { en: string; ar: string }> = {
  breeze_means_current_pit: { en: 'Thinks a Breeze means the current square has a Pit', ar: 'تعتقد أن Breeze تعني وجود Pit في المربع الحالي' },
  breeze_means_wumpus: { en: 'Confuses Breeze with the Wumpus', ar: 'تخلط بين Breeze و Wumpus' },
  stench_means_current_wumpus: { en: 'Thinks a Stench means the Wumpus is in the current square', ar: 'تعتقد أن Stench تعني أن Wumpus في المربع الحالي' },
  stench_means_pit: { en: 'Confuses Stench with a Pit', ar: 'تخلط بين Stench و Pit' },
  all_adjacent_pit: { en: 'Thinks all adjacent squares contain a Pit', ar: 'تعتقد أن كل المربعات المجاورة تحتوي على Pit' },
  possible_vs_confirmed: { en: 'Confuses Possible with Confirmed hazards', ar: 'تخلط بين Possible و Confirmed' },
  forgot_previous: { en: 'Forgets previous observations', ar: 'تنسى الملاحظات السابقة' },
  safe_by_luck: { en: 'Assumes a square is safe because it happens to be safe in reality', ar: 'تفترض أن المربع آمن لأنه آمن فعلاً في العالم الحقيقي' },
  unjustified_conclusion: { en: 'Makes conclusions without enough evidence', ar: 'تصل لاستنتاجات غير مبررة' },
  missed_safe: { en: 'Misses squares that are logically safe', ar: 'لا تلاحظ مربعات آمنة منطقياً' },
};

/** Expected label set for a cell, from the reasoner. Safe cells -> {safe}. Unknown -> {}. */
export function expectedLabels(k: Knowledge, p: Pos, mode: TaskMode): Label[] {
  const c = cellOf(k, p.x, p.y);
  const all: Label[] = [];
  if (c.visited) return [];
  if (c.safe) all.push('safe');
  if (c.pit === 'possible') all.push('possible_pit');
  if (c.pit === 'confirmed') all.push('confirmed_pit');
  if (c.wumpus === 'possible') all.push('possible_wumpus');
  if (c.wumpus === 'confirmed') all.push('confirmed_wumpus');
  return all.filter((l) => TASK_LABELS[mode].includes(l));
}

export interface CellResult { x: number; y: number; expected: Label[]; given: Label[]; ok: boolean }
export interface MapEvaluation {
  correct: boolean; relevant: number; correctCells: number; cellResults: CellResult[]; misconceptions: string[];
}

/**
 * Evaluate a student's map labelling against the reasoner. Only unvisited squares are judged.
 * `before` is the knowledge before the current step (used to detect "forgot previous observation").
 */
export function evaluateMap(
  truth: Knowledge, mode: TaskMode, marks: Record<string, Label[]>, world: World | null, obs: Observation[],
): MapEvaluation {
  const allowed = TASK_LABELS[mode];
  const results: CellResult[] = [];
  const misc = new Set<string>();
  for (const p of allCells()) {
    const c = cellOf(truth, p.x, p.y);
    if (c.visited) continue;
    const expected = expectedLabels(truth, p, mode);
    const given = (marks[key(p.x, p.y)] ?? []).filter((l) => allowed.includes(l) && l !== 'unknown');
    const ok = expected.length === given.length && expected.every((l) => given.includes(l));
    results.push({ x: p.x, y: p.y, expected, given, ok });
    if (ok) continue;
    const has = (l: Label) => given.includes(l);
    const exp = (l: Label) => expected.includes(l);
    if (has('safe') && !exp('safe')) {
      const actuallySafe = world ? !world.pits.some((q) => q.x === p.x && q.y === p.y) && !(world.wumpus.x === p.x && world.wumpus.y === p.y) : false;
      misc.add(actuallySafe ? 'safe_by_luck' : 'unjustified_conclusion');
    }
    if (!has('safe') && exp('safe')) misc.add('missed_safe');
    if ((has('confirmed_pit') && exp('possible_pit')) || (has('confirmed_wumpus') && exp('possible_wumpus')) ||
        (has('possible_pit') && exp('confirmed_pit')) || (has('possible_wumpus') && exp('confirmed_wumpus'))) misc.add('possible_vs_confirmed');
    if ((has('possible_pit') || has('confirmed_pit')) && c.pit === 'none' && neighbors(p.x, p.y).some((n) => obs.some((o) => o.x === n.x && o.y === n.y && !o.breeze))) misc.add('forgot_previous');
    if ((has('possible_wumpus') || has('confirmed_wumpus')) && c.wumpus === 'none' && neighbors(p.x, p.y).some((n) => obs.some((o) => o.x === n.x && o.y === n.y && !o.stench))) misc.add('forgot_previous');
    if ((has('possible_pit') || has('possible_wumpus') || has('confirmed_pit') || has('confirmed_wumpus')) && !misc.has('forgot_previous') &&
        c.pit === 'unknown' && c.wumpus === 'unknown' && !c.safe) misc.add('unjustified_conclusion');
  }
  // "all adjacent squares have a Pit": ≥2 neighbours of one Breeze square marked confirmed while not all confirmed
  for (const o of obs.filter((q) => q.breeze)) {
    const nbs = neighbors(o.x, o.y).filter((n) => !cellOf(truth, n.x, n.y).visited);
    const conf = nbs.filter((n) => (marks[key(n.x, n.y)] ?? []).includes('confirmed_pit'));
    if (conf.length >= 2 && conf.some((n) => cellOf(truth, n.x, n.y).pit !== 'confirmed')) misc.add('all_adjacent_pit');
  }
  const relevantCells = results.filter((r) => r.expected.length > 0 || r.given.length > 0);
  const relevant = relevantCells.length;
  const correctCells = relevantCells.filter((r) => r.ok).length;
  return { correct: results.every((r) => r.ok), relevant, correctCells, cellResults: relevantCells, misconceptions: [...misc] };
}

export function evaluateMcq(cp: Checkpoint, optionId: string): { correct: boolean; misconceptions: string[] } {
  const o = cp.options?.find((q) => q.id === optionId);
  return { correct: !!o?.correct, misconceptions: o && !o.correct && o.misconception ? [o.misconception] : [] };
}

export interface CheckpointContext {
  mode: Mode; step: number; records: InferenceRecord[]; before: Knowledge; after: Knowledge;
  newObs: Observation | null; seen: Record<string, number>; position: Pos;
}

/** Decide which checkpoint(s) fire after a step. Max one MCQ + one map task. */
export function detectCheckpoints(ctx: CheckpointContext): Checkpoint[] {
  if (ctx.mode !== 'guided' || !ctx.newObs) return [];
  const out: Checkpoint[] = [];
  const { newObs: o, records, seen, step } = ctx;
  const id = (k: string) => `cp${step}-${k}`;
  if (o.breeze && !seen.meaning_breeze) {
    out.push({
      id: id('mb'), kind: 'meaning_breeze', step, type: 'mcq', prompt: `The agent perceives a Breeze at ${fmt(o)}. What does it mean?`,
      options: [
        { id: 'a', text: 'At least one adjacent square contains a Pit', correct: true },
        { id: 'b', text: 'There is a Pit in the current square', misconception: 'breeze_means_current_pit' },
        { id: 'c', text: 'A Wumpus is nearby', misconception: 'breeze_means_wumpus' },
      ],
    });
  } else if (o.stench && !seen.meaning_stench) {
    out.push({
      id: id('ms'), kind: 'meaning_stench', step, type: 'mcq', prompt: `The agent perceives a Stench at ${fmt(o)}. What does it mean?`,
      options: [
        { id: 'a', text: 'The Wumpus is in an adjacent square (up, down, left or right)', correct: true },
        { id: 'b', text: 'The Wumpus is in the current square', misconception: 'stench_means_current_wumpus' },
        { id: 'c', text: 'There is a Pit nearby', misconception: 'stench_means_pit' },
      ],
    });
  }
  const has = (k: string) => records.some((r) => r.kind === k);
  const confirmedPit = has('confirm_pit'), confirmedW = has('confirm_wumpus');
  const eliminated = has('eliminate_pit') || has('eliminate_wumpus');
  const newSafeFromPossible = records.some((r) => r.kind === 'safe' && r.squares.some((s) => {
    const b = cellOf(ctx.before, s.x, s.y); return b.pit === 'possible' || b.wumpus === 'possible';
  }));
  const newSafe = has('safe');
  let map: Checkpoint | null = null;
  if (confirmedPit) map = { id: id('cp'), kind: 'confirmed_pit', step, type: 'map', taskMode: 'pit', prompt: 'Which square must contain a Pit? Mark confirmed and still-possible Pits.', hint: 'Combine the Breeze with what you ruled out earlier.' };
  else if (confirmedW) map = { id: id('cw'), kind: 'confirmed_wumpus', step, type: 'map', taskMode: 'wumpus', prompt: 'Which square must contain the Wumpus? Mark confirmed and possible Wumpus squares.', hint: 'Combine the Stench with earlier No-Stench observations.' };
  else if (newSafeFromPossible || (eliminated && newSafe)) map = { id: id('sc'), kind: newSafeFromPossible ? 'safe_combined' : 'elimination', step, type: 'map', taskMode: 'safe', prompt: 'New information arrived. Mark all squares the agent now knows are safe.', hint: 'Remember what you already knew. A new observation can remove a possibility.' };
  else if (o.breeze && (seen.possible_pit ?? 0) < 3) map = { id: id('pp'), kind: 'possible_pit', step, type: 'map', taskMode: 'pit', prompt: 'Which squares could contain a Pit? Mark Possible Pit squares (or Confirmed if you are sure).' };
  else if (o.stench && !ctx.after.wumpusDead && (seen.possible_wumpus ?? 0) < 3) map = { id: id('pw'), kind: 'possible_wumpus', step, type: 'map', taskMode: 'wumpus', prompt: 'Where could the Wumpus be? Mark Possible Wumpus squares (or Confirmed if you are sure).' };
  else if (!o.breeze && !o.stench && !seen.safe_clear && newSafe) map = { id: id('sf'), kind: 'safe_clear', step, type: 'map', taskMode: 'safe', prompt: 'Mark all squares the agent knows are safe.', hint: 'No Breeze and no Stench tell you something about the neighbours.' };
  if (map) out.push(map);
  return out;
}

export function freeCheck(step: number): Checkpoint {
  return { id: `fc${step}-${Date.now().toString(36)}`, kind: 'free_check', step, type: 'map', taskMode: 'full', prompt: 'Label what the agent knows about each unexplored square.' };
}
export { cellIndex };
