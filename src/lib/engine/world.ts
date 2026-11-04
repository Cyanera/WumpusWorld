import { ActionType, AgentState, DIRS, DIR_VEC, NO_PERCEPTS, Percepts, Pos, World, inGrid, neighbors, posKey } from './types';

const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const hasPit = (w: World, x: number, y: number) => w.pits.some((p) => p.x === x && p.y === y);

export function initialAgent(): AgentState {
  return { x: 1, y: 1, dir: 'E', alive: true, hasGold: false, hasArrow: true, wumpusAlive: true, score: 0, actions: 0, outcome: 'playing' };
}

/** Sensory percepts at the agent's current square (bump/scream are action-dependent, passed in). */
export function perceptsAt(w: World, a: AgentState, extra: Partial<Percepts> = {}): Percepts {
  const nb = neighbors(a.x, a.y);
  return {
    stench: a.wumpusAlive && nb.some((p) => same(p, w.wumpus)),
    breeze: nb.some((p) => hasPit(w, p.x, p.y)),
    glitter: !a.hasGold && same(w.gold, a),
    bump: false,
    scream: false,
    ...extra,
  };
}

export interface StepResult { agent: AgentState; percepts: Percepts; moved: boolean; died?: 'pit' | 'wumpus' }

/** Pure transition: standard Wumpus World rules and scoring. */
export function stepWorld(w: World, prev: AgentState, action: ActionType): StepResult {
  const a: AgentState = { ...prev };
  if (!a.alive || a.outcome !== 'playing') return { agent: a, percepts: perceptsAt(w, a), moved: false };
  a.actions += 1;
  a.score -= 1;
  let extra: Partial<Percepts> = {};
  let moved = false;
  switch (action) {
    case 'turn_left': a.dir = DIRS[(DIRS.indexOf(a.dir) + 1) % 4]; break;
    case 'turn_right': a.dir = DIRS[(DIRS.indexOf(a.dir) + 3) % 4]; break;
    case 'forward': {
      const v = DIR_VEC[a.dir];
      const nx = a.x + v.dx, ny = a.y + v.dy;
      if (!inGrid(nx, ny)) { extra.bump = true; break; }
      a.x = nx; a.y = ny; moved = true;
      if (hasPit(w, nx, ny)) { a.alive = false; a.deathCause = 'pit'; }
      else if (a.wumpusAlive && same(w.wumpus, a)) { a.alive = false; a.deathCause = 'wumpus'; }
      if (!a.alive) { a.score -= 1000; a.outcome = 'dead'; }
      break;
    }
    case 'grab': if (!a.hasGold && same(w.gold, a)) a.hasGold = true; break;
    case 'shoot': {
      if (!a.hasArrow) break;
      a.hasArrow = false; a.score -= 10;
      if (a.wumpusAlive) {
        const v = DIR_VEC[a.dir];
        let x = a.x + v.dx, y = a.y + v.dy;
        while (inGrid(x, y)) {
          if (x === w.wumpus.x && y === w.wumpus.y) { a.wumpusAlive = false; extra.scream = true; break; }
          x += v.dx; y += v.dy;
        }
      }
      break;
    }
    case 'climb':
      if (a.x === 1 && a.y === 1) {
        if (a.hasGold) { a.score += 1000; a.outcome = 'won'; } else a.outcome = 'escaped_no_gold';
      }
      break;
  }
  return { agent: a, percepts: perceptsAt(w, a, extra), moved, died: a.alive ? undefined : a.deathCause };
}

/** Is there a path [1,1] -> gold that avoids every pit and the Wumpus square? (and thus a path back) */
export function hasSafePath(w: World): boolean {
  const blocked = new Set([...w.pits.map(posKey), posKey(w.wumpus)]);
  const seen = new Set(['1,1']);
  const q: Pos[] = [{ x: 1, y: 1 }];
  while (q.length) {
    const c = q.shift()!;
    if (same(c, w.gold)) return true;
    for (const n of neighbors(c.x, c.y)) {
      const k = posKey(n);
      if (!blocked.has(k) && !seen.has(k)) { seen.add(k); q.push(n); }
    }
  }
  return false;
}

export function validateWorld(w: World): string[] {
  const errs: string[] = [];
  const at11 = (p: Pos) => p.x === 1 && p.y === 1;
  if (at11(w.wumpus)) errs.push('wumpus at start');
  if (at11(w.gold)) errs.push('gold at start');
  if (w.pits.some(at11)) errs.push('pit at start');
  if (w.pits.some((p) => same(p, w.wumpus))) errs.push('pit shares wumpus square');
  if (w.pits.some((p) => same(p, w.gold))) errs.push('pit shares gold square');
  if (same(w.wumpus, w.gold)) errs.push('wumpus shares gold square');
  if (new Set(w.pits.map(posKey)).size !== w.pits.length) errs.push('duplicate pits');
  if (![w.wumpus, w.gold, ...w.pits].every((p) => inGrid(p.x, p.y))) errs.push('out of grid');
  if (!hasSafePath(w)) errs.push('gold unreachable');
  return errs;
}
