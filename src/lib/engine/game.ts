import {
  AgentState, ActionType, Difficulty, Knowledge, Label, Mode, NO_PERCEPTS, Observation, Percepts, Pos, World, allCells, fmt, key, neighbors,
} from './types';
import { generateWorld } from './simulate';
import { initialAgent, perceptsAt, stepWorld } from './world';
import { InferenceRecord, KBInput, cellOf, classify, compact, deriveRecords, snapOf } from './reasoner';
import {
  CATEGORY_OF, Checkpoint, MISCONCEPTIONS, MapEvaluation, detectCheckpoints, evaluateMap, evaluateMcq, freeCheck, TASK_LABELS,
} from './checkpoints';

export interface Stats {
  perceptsEncountered: number; correctInferences: number; incorrectInferences: number;
  cellsCorrect: number; cellsRelevant: number; safeDecisions: number; riskyDecisions: number; freeChecks: number;
}
export interface Feedback {
  checkpointId: string; kind: string; correct: boolean; summary: string; details: string[];
  evaluation?: MapEvaluation; mcq?: { chosen: string; correctId: string };
  recordStep: number;
}
export interface GameState {
  id: string; mode: Mode; difficulty: Difficulty;
  agent: AgentState; obs: Observation[]; percepts: Percepts; cellPercepts: Record<string, Percepts>;
  seq: number; reveal: { obsCount: number; wumpusDead: boolean; recSeq: number };
  pending: Checkpoint[]; seen: Record<string, number>; stats: Stats; lastFeedback: Feedback | null;
  marks: Record<string, Label[]>; lastOpId?: string;
}
export interface GameEventPayload {
  kind: 'start' | 'action' | 'checkpoint' | 'end';
  seq: number; action?: ActionType; agent: Pick<AgentState, 'x' | 'y' | 'dir' | 'alive' | 'hasGold' | 'hasArrow' | 'wumpusAlive' | 'score' | 'outcome'>;
  percepts: Percepts; risky?: boolean; riskReason?: string; truth: string[]; truthWumpusDead: boolean;
  recordIds: string[]; checkpoints?: Checkpoint[]; attemptId?: string; correct?: boolean; evaluation?: MapEvaluation; answer?: unknown;
  checkpoint?: Checkpoint; recSeq?: number;
}
export interface AttemptPayload {
  id: string; checkpointId: string; kind: string; category: string; step: number; correct: boolean;
  cellsCorrect: number; cellsRelevant: number; misconceptions: string[]; answer: unknown; evaluation?: MapEvaluation; mcq?: { chosen: string; correctId: string };
}
export interface Output { state: GameState; event: GameEventPayload; records: InferenceRecord[]; attempt?: AttemptPayload }

const freshStats = (): Stats => ({ perceptsEncountered: 0, correctInferences: 0, incorrectInferences: 0, cellsCorrect: 0, cellsRelevant: 0, safeDecisions: 0, riskyDecisions: 0, freeChecks: 0 });
const kbOf = (s: GameState): KBInput => ({ obs: s.obs, wumpusDead: !s.agent.wumpusAlive });
export const engineKnowledge = (s: GameState) => classify(kbOf(s));
export const displayKnowledge = (s: GameState) => classify({ obs: s.obs.slice(0, s.reveal.obsCount), wumpusDead: s.reveal.wumpusDead });
export const isOver = (s: GameState) => s.agent.outcome !== 'playing';

const evSnap = (s: GameState, kind: GameEventPayload['kind'], extra: Partial<GameEventPayload> = {}): GameEventPayload => {
  const a = s.agent;
  return {
    kind, seq: s.seq, agent: { x: a.x, y: a.y, dir: a.dir, alive: a.alive, hasGold: a.hasGold, hasArrow: a.hasArrow, wumpusAlive: a.wumpusAlive, score: a.score, outcome: a.outcome },
    percepts: s.percepts, truth: compact(engineKnowledge(s)), truthWumpusDead: !a.wumpusAlive, recordIds: [], ...extra,
  };
};
const revealAll = (s: GameState, recSeq = s.seq) => { s.reveal = { obsCount: s.obs.length, wumpusDead: !s.agent.wumpusAlive, recSeq }; };

/** Create a brand-new random game. Returns the state and the hidden world (persist separately!). */
export function newGame(id: string, mode: Mode, difficulty: Difficulty = 'normal', pits?: number, worldOverride?: World): { state: GameState; world: World; out: Output } {
  const world = worldOverride ?? generateWorld({ difficulty, pits });
  const agent = initialAgent();
  const percepts = perceptsAt(world, agent);
  const obs: Observation[] = [{ x: 1, y: 1, breeze: percepts.breeze, stench: percepts.stench, step: 0 }];
  const state: GameState = {
    id, mode, difficulty, agent, obs, percepts, cellPercepts: { '1,1': percepts }, seq: 0,
    reveal: { obsCount: 0, wumpusDead: false, recSeq: -1 }, pending: [], seen: {}, stats: freshStats(), lastFeedback: null, marks: {},
  };
  state.stats.perceptsEncountered = Number(percepts.breeze) + Number(percepts.stench);
  const before = snapOf({ obs: [], wumpusDead: false });
  const after = snapOf(kbOf(state));
  // The start square [1,1] is safe by the rules of the game; the first inference records explain the neighbours.
  const records = deriveRecords(before, after, 0, new Date().toISOString());
  const cps = detectCheckpoints({ mode, step: 0, records, before: before.k, after: after.k, newObs: obs[0], seen: state.seen, position: agent });
  state.pending = cps; cps.forEach((c) => (state.seen[c.kind] = (state.seen[c.kind] ?? 0) + 1));
  if (!cps.length && mode === 'guided') revealAll(state, 0);
  const event = evSnap(state, 'start', { recordIds: records.map((r) => r.id), checkpoints: cps });
  return { state, world, out: { state, event, records } };
}

function assessDecision(before: Knowledge, s: GameState, action: ActionType): { risky: boolean; reason?: string } | null {
  const a = s.agent;
  if (action === 'forward') {
    const d = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] }[a.dir];
    const tx = a.x + d[0], ty = a.y + d[1];
    if (tx < 1 || tx > 4 || ty < 1 || ty > 4) return null; // bump: not a hazard decision
    const c = cellOf(before, tx, ty);
    return c.safe ? { risky: false } : { risky: true, reason: `${fmt({ x: tx, y: ty })} was not proven safe` };
  }
  if (action === 'shoot' && a.hasArrow) {
    const d = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] }[a.dir];
    let x = a.x + d[0], y = a.y + d[1], found = false;
    while (x >= 1 && x <= 4 && y >= 1 && y <= 4) { const c = cellOf(before, x, y); if (c.wumpus === 'possible' || c.wumpus === 'confirmed') found = true; x += d[0]; y += d[1]; }
    return found && a.wumpusAlive ? { risky: false } : { risky: true, reason: 'the arrow was shot without evidence of a Wumpus in that line' };
  }
  return null;
}

export type ActionError = 'game_over' | 'checkpoint_pending';

export function applyAction(prev: GameState, world: World, action: ActionType, now = new Date()): Output | { error: ActionError } {
  if (isOver(prev)) return { error: 'game_over' };
  if (prev.pending.length) return { error: 'checkpoint_pending' };
  const s: GameState = structuredClone(prev);
  const beforeSnap = snapOf(kbOf(s));
  const decision = assessDecision(beforeSnap.k, s, action);
  const wasAlive = s.agent.wumpusAlive;
  const r = stepWorld(world, s.agent, action);
  s.agent = r.agent; s.seq += 1; s.percepts = r.percepts;
  const stats = s.stats;
  if (decision) { if (decision.risky) stats.riskyDecisions++; else stats.safeDecisions++; }
  if (r.percepts.bump) stats.perceptsEncountered++;
  if (r.percepts.scream) stats.perceptsEncountered++;
  let newObs: Observation | null = null;
  if (s.agent.alive && s.agent.outcome === 'playing') {
    const k = key(s.agent.x, s.agent.y);
    if (!s.obs.some((o) => o.x === s.agent.x && o.y === s.agent.y)) {
      newObs = { x: s.agent.x, y: s.agent.y, breeze: r.percepts.breeze, stench: r.percepts.stench, step: s.seq };
      s.obs.push(newObs);
      s.cellPercepts[k] = r.percepts;
      stats.perceptsEncountered += Number(r.percepts.breeze) + Number(r.percepts.stench) + Number(r.percepts.glitter);
    } else if (r.percepts.glitter) {
      s.cellPercepts[k] = { ...(s.cellPercepts[k] ?? NO_PERCEPTS), glitter: true };
    }
    if (action === 'grab' && s.cellPercepts[k]) s.cellPercepts[k] = { ...s.cellPercepts[k], glitter: false };
  }
  const screamed = wasAlive && !s.agent.wumpusAlive;
  const afterSnap = snapOf(kbOf(s));
  const records = newObs || screamed ? deriveRecords(beforeSnap, afterSnap, s.seq, now.toISOString(), { screamed }) : [];
  const cps = detectCheckpoints({ mode: s.mode, step: s.seq, records, before: beforeSnap.k, after: afterSnap.k, newObs, seen: s.seen, position: s.agent });
  cps.forEach((c) => (s.seen[c.kind] = (s.seen[c.kind] ?? 0) + 1));
  s.pending = cps;
  s.lastFeedback = cps.length ? null : s.lastFeedback;
  const over = isOver(s);
  if (over) { s.pending = []; revealAll(s); }
  else if (s.mode === 'guided' && !cps.length) revealAll(s);
  else if (s.mode === 'guided' && cps.length) { /* hold back inferred knowledge until the checkpoint is answered */ }
  const event = evSnap(s, 'action', {
    action, risky: decision?.risky, riskReason: decision?.reason, recordIds: records.map((x) => x.id), checkpoints: cps,
  });
  if (over) event.kind = 'action';
  return { state: s, event, records };
}

// ------------------------------------------------------------------------------------------------
function describeMap(cp: Checkpoint, ev: MapEvaluation): { summary: string; details: string[] } {
  const miss = ev.cellResults.filter((r) => !r.ok);
  const details: string[] = [];
  const lab = (ls: Label[]) => (ls.length ? ls.map((l) => l.replace('_', ' ')).join(' + ') : 'unknown / nothing');
  for (const m of miss) details.push(`${fmt(m)}: you marked ${lab(m.given)}; the evidence supports ${lab(m.expected)}.`);
  for (const k of ev.misconceptions) details.push(`Watch out: ${MISCONCEPTIONS[k]?.en ?? k}.`);
  if (ev.correct) {
    const text: Record<string, string> = {
      safe_clear: 'You correctly identified the squares that are logically safe.',
      safe_combined: 'You combined old and new observations correctly to find safe squares.',
      elimination: 'You used the new observation to eliminate a possibility.',
      possible_pit: 'You distinguished possible Pits from squares that are ruled out.',
      confirmed_pit: 'You correctly identified a Pit that must exist.',
      possible_wumpus: 'You located the possible Wumpus squares correctly.',
      confirmed_wumpus: 'You correctly identified where the Wumpus must be.',
      free_check: 'Your labels match what the agent can justify.',
    };
    return { summary: text[cp.kind] ?? 'Correct reasoning.', details };
  }
  return { summary: `${ev.correctCells} of ${ev.relevant} squares were labelled correctly. Compare with the explanation below.`, details };
}

export function submitCheckpoint(
  prev: GameState, world: World | null, answer: { checkpointId: string; marks?: Record<string, Label[]>; optionId?: string; freeMarks?: Record<string, Label[]> }, attemptId: string,
): { error: string } | Output {
  const s: GameState = structuredClone(prev);
  let cp: Checkpoint | undefined;
  const isFree = !s.pending.length || answer.checkpointId.startsWith('fc');
  if (isFree) {
    if (isOver(s)) return { error: 'game_over' };
    if (s.pending.length) return { error: 'checkpoint_pending' };
    cp = freeCheck(s.seq);
  } else {
    cp = s.pending[0];
    if (cp.id !== answer.checkpointId) return { error: 'wrong_checkpoint' };
  }
  const truth = engineKnowledge(s);
  let attempt: AttemptPayload;
  let feedback: Feedback;
  if (cp.type === 'mcq') {
    if (!answer.optionId) return { error: 'missing_answer' };
    const ev = evaluateMcq(cp, answer.optionId);
    const correctId = cp.options!.find((o) => o.correct)!.id;
    attempt = { id: attemptId, checkpointId: cp.id, kind: cp.kind, category: CATEGORY_OF[cp.kind], step: cp.step, correct: ev.correct, cellsCorrect: ev.correct ? 1 : 0, cellsRelevant: 1, misconceptions: ev.misconceptions, answer: { optionId: answer.optionId }, mcq: { chosen: answer.optionId, correctId } };
    feedback = {
      checkpointId: cp.id, kind: cp.kind, correct: ev.correct, recordStep: cp.step, mcq: { chosen: answer.optionId, correctId },
      summary: ev.correct ? (cp.kind === 'meaning_breeze' ? 'Right: a Breeze says at least one neighbouring square has a Pit, not that this square does.' : 'Right: a Stench says the Wumpus is in a neighbouring square.') : 'Not quite. Percepts describe the neighbouring squares, not the square you stand on.',
      details: ev.misconceptions.map((m) => MISCONCEPTIONS[m].en),
    };
  } else {
    const marks = (isFree ? answer.freeMarks : answer.marks) ?? answer.marks ?? {};
    const ev = evaluateMap(truth, cp.taskMode ?? 'full', marks, world, s.obs);
    const d = describeMap(cp, ev);
    attempt = { id: attemptId, checkpointId: cp.id, kind: cp.kind, category: CATEGORY_OF[cp.kind], step: cp.step, correct: ev.correct, cellsCorrect: ev.correctCells, cellsRelevant: ev.relevant, misconceptions: ev.misconceptions, answer: { marks }, evaluation: ev };
    feedback = { checkpointId: cp.id, kind: cp.kind, correct: ev.correct, evaluation: ev, summary: d.summary, details: d.details, recordStep: cp.step };
    s.marks = marks;
  }
  const st = s.stats;
  if (attempt.correct) st.correctInferences++; else st.incorrectInferences++;
  st.cellsCorrect += attempt.cellsCorrect; st.cellsRelevant += attempt.cellsRelevant;
  if (isFree) st.freeChecks++;
  else s.pending = s.pending.slice(1);
  s.lastFeedback = feedback;
  s.seq += 1;
  // reveal inferred knowledge once all pending checkpoints are done
  if (!s.pending.length) revealAll(s);
  const event = evSnap(s, 'checkpoint', { checkpoint: cp, attemptId, correct: attempt.correct, evaluation: attempt.evaluation, answer: attempt.answer, recSeq: s.reveal.recSeq });
  return { state: s, event, records: [], attempt };
}

// ------------------------------------------------------------------------------------------------
export interface ThinkingStep { title: string; text: string; squares: Pos[] }
export function buildThinking(s: GameState, shown: Knowledge, recs: InferenceRecord[]): ThinkingStep[] {
  const here = { x: s.agent.x, y: s.agent.y };
  const p = s.percepts;
  const list: string[] = [];
  if (p.breeze) list.push('a Breeze'); if (p.stench) list.push('a Stench'); if (p.glitter) list.push('Glitter'); if (p.bump) list.push('a Bump'); if (p.scream) list.push('a Scream');
  const perception = list.length ? `I perceive ${list.join(' and ')} in ${fmt(here)}.` : `I perceive nothing unusual in ${fmt(here)}.`;
  const safe = shown.cells.filter((c) => c.visited || c.safe);
  const knowledge = safe.length ? `I already know that ${safe.slice(0, 6).map(fmt).join(', ')} ${safe.length === 1 ? 'is' : 'are'} safe.` : 'I know very little so far.';
  const latest = recs.filter((r) => r.step === recs.reduce((m, q) => Math.max(m, q.step), -1) && r.kind !== 'safe');
  const inferText = latest.length ? latest.map((r) => r.inference.text.replace(/^Pit confirmed/, 'A Pit is confirmed')).join(' ') : 'No new conclusion from this square.';
  const frontierSafe = shown.cells.filter((c) => c.safe && !c.visited);
  const decision = s.agent.outcome !== 'playing' ? 'The episode is over.'
    : s.agent.hasGold ? 'I have the gold. I should return to [1,1] through squares I know are safe and climb out.'
    : s.percepts.glitter ? 'I perceive Glitter, so I should Grab the gold.'
    : frontierSafe.length ? `I should avoid unverified danger: ${frontierSafe.slice(0, 4).map(fmt).join(', ')} ${frontierSafe.length === 1 ? 'is a safe square' : 'are safe squares'} to explore.`
    : 'No unexplored square is proven safe. I should think before taking a risk.';
  const sq = (r: InferenceRecord[]) => r.flatMap((x) => x.squares);
  return [
    { title: 'Perception', text: perception, squares: [here] },
    { title: 'Knowledge', text: knowledge, squares: safe.slice(0, 6).map((c) => ({ x: c.x, y: c.y })) },
    { title: 'Inference', text: inferText, squares: sq(latest) },
    { title: 'Decision', text: decision, squares: frontierSafe.map((c) => ({ x: c.x, y: c.y })) },
  ];
}

export interface StudentGameView {
  id: string; mode: Mode; over: boolean; outcome: string; deathCause?: string;
  agent: { x: number; y: number; dir: string; alive: boolean; hasGold: boolean; hasArrow: boolean; wumpusAlive: boolean };
  score: number; actions: number; percepts: Percepts;
  cells: { x: number; y: number; visited: boolean; breeze: boolean; stench: boolean; glitter: boolean; safe: boolean; pit: string; wumpus: string }[];
  pending: Checkpoint | null; pendingCount: number; feedback: Feedback | null; thinking: ThinkingStep[];
  kb: { safe: string[]; possiblePits: string[]; confirmedPits: string[]; possibleWumpus: string[]; confirmedWumpus: string[]; observations: string[]; conclusions: string[]; wumpusDead: boolean };
  records: InferenceRecord[]; stats: Stats; checkpointsDone: number;
  world: { pits: Pos[]; wumpus: Pos; gold: Pos } | null; seq: number;
}

/** What the student's browser is allowed to see. Hidden world data is included ONLY after the game ended. */
export function studentView(s: GameState, records: InferenceRecord[], world: World | null): StudentGameView {
  const shown = displayKnowledge(s);
  const visibleRecs = records.filter((r) => r.step <= s.reveal.recSeq);
  const over = isOver(s);
  const L = (pred: (c: ReturnType<typeof cellOf>) => boolean) => shown.cells.filter((c) => !c.visited && pred(c)).map(fmt);
  const obsText = s.obs.map((o) => `${fmt(o)}: ${[o.breeze ? 'Breeze' : 'no Breeze', o.stench ? 'Stench' : 'no Stench'].join(', ')}`);
  return {
    id: s.id, mode: s.mode, over, outcome: s.agent.outcome, deathCause: s.agent.deathCause,
    agent: { x: s.agent.x, y: s.agent.y, dir: s.agent.dir, alive: s.agent.alive, hasGold: s.agent.hasGold, hasArrow: s.agent.hasArrow, wumpusAlive: s.agent.wumpusAlive },
    score: s.agent.score, actions: s.agent.actions, percepts: s.percepts,
    cells: allCells().map((p) => {
      const k = key(p.x, p.y); const cp = s.cellPercepts[k]; const c = cellOf(shown, p.x, p.y);
      return { x: p.x, y: p.y, visited: !!cp, breeze: !!cp?.breeze, stench: !!cp?.stench, glitter: !!cp?.glitter, safe: !!cp || c.safe, pit: cp ? 'none' : c.pit, wumpus: cp ? 'none' : c.wumpus };
    }),
    pending: s.pending[0] ?? null, pendingCount: s.pending.length, feedback: s.lastFeedback,
    thinking: buildThinking(s, shown, visibleRecs),
    kb: {
      safe: shown.cells.filter((c) => c.safe && !c.visited).map(fmt),
      possiblePits: L((c) => c.pit === 'possible'), confirmedPits: L((c) => c.pit === 'confirmed'),
      possibleWumpus: L((c) => c.wumpus === 'possible'), confirmedWumpus: L((c) => c.wumpus === 'confirmed'),
      observations: obsText, conclusions: visibleRecs.slice(-6).map((r) => r.inference.text), wumpusDead: shown.wumpusDead,
    },
    records: visibleRecs, stats: s.stats, checkpointsDone: s.stats.correctInferences + s.stats.incorrectInferences,
    world: over && world ? { pits: world.pits, wumpus: world.wumpus, gold: world.gold } : null, seq: s.seq,
  };
}

export interface Report {
  perceptsEncountered: number; correctInferences: number; incorrectInferences: number; safeDecisions: number; riskyDecisions: number;
  outcome: string; score: number; reasoningAccuracy: number; feedback: string[]; byCategory: Record<string, { correct: number; total: number }>;
}
export function buildReport(s: GameState, attempts: { category: string; correct: boolean; misconceptions: string[] }[]): Report {
  const st = s.stats;
  const acc = st.cellsRelevant ? st.cellsCorrect / st.cellsRelevant : 0;
  const byCategory: Report['byCategory'] = {};
  for (const a of attempts) { const c = (byCategory[a.category] ??= { correct: 0, total: 0 }); c.total++; if (a.correct) c.correct++; }
  const pct = (c?: { correct: number; total: number }) => (c && c.total ? c.correct / c.total : null);
  const fb: string[] = [];
  const f = (cat: string, good: string, bad: string) => { const p = pct(byCategory[cat]); if (p === null) return; fb.push(p >= 0.67 ? good : bad); };
  f('safe_recognition', 'You correctly identified squares that were safe.', 'You sometimes marked squares as safe without enough evidence, or missed safe ones.');
  f('possible_pit', 'You distinguished between possible and confirmed hazards.', 'Practice telling a Possible Pit from a Confirmed Pit: a Breeze only says "at least one neighbour".');
  f('knowledge_integration', 'You successfully combined multiple observations.', 'Remember to combine new observations with what you learned earlier. A new percept can eliminate a possibility.');
  f('percept_understanding', 'You understood what Breeze and Stench really mean.', 'Re-read the percepts: they describe the neighbouring squares, not the current one.');
  f('wumpus_identification', 'You reasoned correctly about where the Wumpus is.', 'The Wumpus is in exactly one square: use Stench and No-Stench together.');
  f('confirmed_pit', 'You identified a Pit that must exist.', 'A Pit is confirmed only when every other candidate has been ruled out.');
  const total = st.safeDecisions + st.riskyDecisions;
  if (st.riskyDecisions > 0) fb.push(`You made ${st.riskyDecisions} risky move${st.riskyDecisions > 1 ? 's' : ''} without enough evidence (${st.riskyDecisions} of ${total} decisions).`);
  else if (total > 0) fb.push('Every move you made was justified by the available evidence.');
  if (!fb.length) fb.push('Play a few more steps in Guided mode to get reasoning feedback.');
  return {
    perceptsEncountered: st.perceptsEncountered, correctInferences: st.correctInferences, incorrectInferences: st.incorrectInferences,
    safeDecisions: st.safeDecisions, riskyDecisions: st.riskyDecisions, outcome: s.agent.outcome, score: s.agent.score,
    reasoningAccuracy: Math.round(acc * 100), feedback: fb, byCategory,
  };
}
export { TASK_LABELS, neighbors };
