import { AgentState, Difficulty, ActionType, DIRS, DIR_VEC, Observation, Pos, World, allCells, inGrid, neighbors, posKey, SIZE } from './types';
import { Rng, mulberry32, pick, randomSeed, shuffle } from './rng';
import { hasSafePath, initialAgent, perceptsAt, stepWorld, validateWorld } from './world';
import { KBInput, cellOf, classify } from './reasoner';

/**
 * A "perfect knowledge-based agent": only moves into logically safe squares.
 * Used (1) to score how pedagogically useful a random world is, and (2) for fresh demos.
 */
export interface SimResult { actions: ActionType[]; success: boolean; stuck: boolean; stats: Stats }
export interface Stats { breezeUncertain: number; eliminations: number; combined: number; confirmed: number; stench: number; visited: number; startPercept: boolean }

function dirTo(from: Pos, to: Pos) {
  return DIRS.find((d) => DIR_VEC[d].dx === to.x - from.x && DIR_VEC[d].dy === to.y - from.y)!;
}
function turnsTo(cur: AgentState['dir'], want: AgentState['dir']): ActionType[] {
  const diff = (DIRS.indexOf(want) - DIRS.indexOf(cur) + 4) % 4;
  return diff === 0 ? [] : diff === 1 ? ['turn_left'] : diff === 2 ? ['turn_left', 'turn_left'] : ['turn_right'];
}
function bfs(start: Pos, goal: (p: Pos) => boolean, passable: (p: Pos) => boolean): Pos[] | null {
  const prev = new Map<string, Pos | null>([[posKey(start), null]]);
  const q = [start];
  while (q.length) {
    const c = q.shift()!;
    if (goal(c)) { const path: Pos[] = []; let cur: Pos | null = c; while (cur) { path.unshift(cur); cur = prev.get(posKey(cur)) ?? null; } return path; }
    for (const n of neighbors(c.x, c.y)) if (!prev.has(posKey(n)) && passable(n)) { prev.set(posKey(n), c); q.push(n); }
  }
  return null;
}

export function simulateAgent(w: World, maxActions = 120): SimResult {
  let a = initialAgent();
  const obs: Observation[] = [];
  const stats: Stats = { breezeUncertain: 0, eliminations: 0, combined: 0, confirmed: 0, stench: 0, visited: 0, startPercept: false };
  const actions: ActionType[] = [];
  const kb = (): KBInput => ({ obs, wumpusDead: !a.wumpusAlive });
  const observe = (percepts = perceptsAt(w, a)) => {
    if (obs.some((o) => o.x === a.x && o.y === a.y)) return;
    const before = classify(kb());
    obs.push({ x: a.x, y: a.y, breeze: percepts.breeze, stench: percepts.stench, step: actions.length });
    const after = classify(kb());
    if (percepts.stench) stats.stench++;
    if (percepts.breeze && neighbors(a.x, a.y).filter((n) => cellOf(after, n.x, n.y).pit !== 'none').length >= 2) stats.breezeUncertain++;
    for (const c of after.cells) {
      const b = cellOf(before, c.x, c.y);
      if (!c.visited && ((b.pit === 'possible' && c.pit === 'none') || (b.wumpus === 'possible' && c.wumpus === 'none'))) stats.eliminations++;
      if (!c.visited && c.safe && !b.safe && (b.pit === 'possible' || b.wumpus === 'possible')) stats.combined++;
      if (!c.visited && ((c.pit === 'confirmed' && b.pit !== 'confirmed') || (c.wumpus === 'confirmed' && b.wumpus !== 'confirmed'))) stats.confirmed++;
    }
  };
  const doAct = (act: ActionType) => {
    const r = stepWorld(w, a, act); a = r.agent; actions.push(act);
    if (a.alive && a.outcome === 'playing') observe(r.percepts);
    return r;
  };
  observe();
  stats.startPercept = perceptsAt(w, a).breeze || perceptsAt(w, a).stench;
  const walk = (path: Pos[]) => {
    for (let i = 1; i < path.length; i++) {
      for (const t of turnsTo(a.dir, dirTo(a, path[i]))) doAct(t);
      doAct('forward');
      if (!a.alive) return false;
    }
    return true;
  };
  let guard = 0;
  while (a.outcome === 'playing' && a.alive && actions.length < maxActions && guard++ < 60) {
    const k = classify(kb());
    const passable = (p: Pos) => cellOf(k, p.x, p.y).safe;
    if (perceptsAt(w, a).glitter) { doAct('grab'); continue; }
    if (a.hasGold) {
      const path = bfs(a, (p) => p.x === 1 && p.y === 1, passable);
      if (path) walk(path);
      doAct('climb');
      break;
    }
    const target = bfs(a, (p) => !cellOf(k, p.x, p.y).visited && cellOf(k, p.x, p.y).safe, passable);
    if (target && target.length > 1) { walk(target); continue; }
    // Stuck: try to shoot a confirmed Wumpus from a safe square in the same row/column
    const wc = k.cells.find((c) => c.wumpus === 'confirmed');
    if (wc && a.hasArrow && a.wumpusAlive) {
      const p = bfs(a, (q) => (q.x === wc.x || q.y === wc.y) && cellOf(k, q.x, q.y).visited, passable);
      if (p) {
        walk(p);
        const line = a.x === wc.x ? (wc.y > a.y ? 'N' : 'S') : wc.x > a.x ? 'E' : 'W';
        for (const t of turnsTo(a.dir, line as AgentState['dir'])) doAct(t);
        doAct('shoot');
        continue;
      }
    }
    return { actions, success: false, stuck: true, stats: { ...stats, visited: obs.length } };
  }
  return { actions, success: a.outcome === 'won', stuck: a.outcome !== 'won', stats: { ...stats, visited: obs.length } };
}

export function teachingScore(w: World): { score: number; notes: string[]; safeSolvable: boolean } {
  const sim = simulateAgent(w);
  const s = sim.stats; const notes: string[] = [];
  let score = 0;
  if (sim.success) { score += 4; notes.push('solvable using only logically safe moves'); }
  const bu = Math.min(s.breezeUncertain, 2); score += bu * 2; if (bu) notes.push(`${s.breezeUncertain} uncertain Breeze moment(s)`);
  if (s.eliminations) { score += 3 + Math.min(s.eliminations, 2); notes.push('a possibility is eliminated by later evidence'); }
  if (s.combined) { score += 3; notes.push('a square becomes safe after combining evidence'); }
  if (s.confirmed) { score += 2; notes.push('a hazard becomes confirmed'); }
  if (s.stench) { score += 1; notes.push('Stench encountered'); }
  if (s.startPercept) { score -= 4; notes.push('percept at the start square (harder)'); }
  if (s.visited <= 3) { score -= 4; notes.push('very trivial'); }
  return { score, notes, safeSolvable: sim.success };
}

export interface GenOptions { pits?: number; difficulty?: Difficulty; seed?: string; attempts?: number }

/** Generate a random, valid, solvable, pedagogically useful world. */
export function generateWorld(opts: GenOptions = {}): World {
  const difficulty = opts.difficulty ?? 'normal';
  const pitCount = Math.max(1, Math.min(opts.pits ?? (difficulty === 'easy' ? 2 : difficulty === 'hard' ? 3 : 2 + Math.floor(Math.random() * 2)), 5));
  const baseSeed = opts.seed ?? randomSeed();
  const need = difficulty === 'easy' ? 4 : difficulty === 'normal' ? 11 : 13;
  let best: World | null = null;
  const attempts = opts.attempts ?? 250;
  for (let i = 0; i < attempts; i++) {
    const seed = `${baseSeed}:${i}`;
    const rng: Rng = mulberry32(seed);
    const cells = allCells().filter((c) => !(c.x === 1 && c.y === 1));
    const sh = shuffle(rng, cells);
    const wumpus = sh[0];
    const rest = sh.slice(1);
    const pits = rest.slice(0, pitCount);
    const gold = pick(rng, rest.slice(pitCount));
    const w: World = { pits, wumpus, gold, seed, teaching: { score: 0, notes: [], safeSolvable: false } };
    if (validateWorld(w).length) continue;
    w.teaching = teachingScore(w);
    if (!best || w.teaching.score > best.teaching.score) best = w;
    if (w.teaching.score >= need && w.teaching.safeSolvable) return w;
  }
  if (!best) throw new Error('could not generate a world');
  return best;
}
export { hasSafePath, inGrid, SIZE };
