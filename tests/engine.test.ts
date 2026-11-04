import { describe, expect, it } from 'vitest';
import { generateWorld, simulateAgent } from '@/lib/engine/simulate';
import { hasSafePath, initialAgent, perceptsAt, stepWorld, validateWorld } from '@/lib/engine/world';
import { classify, deriveRecords, snapOf } from '@/lib/engine/reasoner';
import { cellIndex, neighbors, allCells, Observation } from '@/lib/engine/types';
import { Clause } from '@/lib/engine/formal';
import { mkWorld } from './helpers';

const W = mkWorld([{ x: 3, y: 1 }, { x: 1, y: 3 }], { x: 2, y: 2 }, { x: 2, y: 3 });

describe('percepts', () => {
  it('breeze only from orthogonal pits (diagonals ignored)', () => {
    const a = { ...initialAgent(), x: 2, y: 1 };
    expect(perceptsAt(W, a).breeze).toBe(true); // pit at [3,1]
    expect(perceptsAt(W, { ...initialAgent(), x: 2, y: 2 }).breeze).toBe(false); // pits diagonal-only? [3,1],[1,3] are diagonal to [2,2]
    expect(perceptsAt(W, { ...initialAgent(), x: 1, y: 1 }).breeze).toBe(false);
  });
  it('stench only from orthogonal live wumpus', () => {
    expect(perceptsAt(W, { ...initialAgent(), x: 2, y: 1 }).stench).toBe(true);
    expect(perceptsAt(W, { ...initialAgent(), x: 1, y: 1 }).stench).toBe(false); // diagonal
    expect(perceptsAt(W, { ...initialAgent(), x: 2, y: 1, wumpusAlive: false }).stench).toBe(false);
  });
  it('glitter, bump, scream, scoring', () => {
    let a = { ...initialAgent(), x: 2, y: 3 };
    expect(perceptsAt(W, a).glitter).toBe(true);
    let r = stepWorld(W, initialAgent(), 'turn_left'); // facing N
    r = stepWorld(W, { ...r.agent, dir: 'W' }, 'forward');
    expect(r.percepts.bump).toBe(true);
    expect(r.agent.score).toBe(-2);
    const shooter = { ...initialAgent(), x: 2, y: 1, dir: 'N' as const };
    const s = stepWorld(W, shooter, 'shoot');
    expect(s.percepts.scream).toBe(true);
    expect(s.agent.wumpusAlive).toBe(false);
    expect(s.agent.score).toBe(-11);
    const dead = stepWorld(W, { ...initialAgent(), x: 2, y: 1 }, 'forward'); // E -> pit at 3,1
    expect(dead.agent.alive).toBe(false);
    expect(dead.agent.score).toBe(-1001);
  });
  it('win condition: grab, return, climb = +1000', () => {
    let a = { ...initialAgent(), x: 1, y: 1, hasGold: true };
    const r = stepWorld(W, a, 'climb');
    expect(r.agent.outcome).toBe('won');
    expect(r.agent.score).toBe(999);
  });
});

describe('world generation', () => {
  it('always valid, safe start, solvable, random across calls', () => {
    const sigs = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const w = generateWorld({ difficulty: i % 3 === 0 ? 'easy' : 'normal' });
      expect(validateWorld(w)).toEqual([]);
      expect(hasSafePath(w)).toBe(true);
      expect(w.pits.length).toBeGreaterThanOrEqual(2);
      expect([...w.pits, w.wumpus, w.gold].every((p) => !(p.x === 1 && p.y === 1))).toBe(true);
      sigs.add(JSON.stringify([w.pits, w.wumpus, w.gold]));
    }
    expect(sigs.size).toBeGreaterThan(40);
  });
  it('normal worlds are teaching-rich and solvable with logic only', () => {
    let rich = 0;
    for (let i = 0; i < 25; i++) { const w = generateWorld({ difficulty: 'normal' }); if (w.teaching.safeSolvable && w.teaching.score >= 8) rich++; }
    expect(rich).toBeGreaterThanOrEqual(22);
  });
  it('is reproducible from a seed', () => {
    const a = generateWorld({ seed: 'abc', pits: 3 }), b = generateWorld({ seed: 'abc', pits: 3 });
    expect(a).toEqual(b);
  });
});

describe('reasoner', () => {
  const obs = (x: number, y: number, breeze: boolean, stench: boolean, step = 0): Observation => ({ x, y, breeze, stench, step });
  it('no percept at start => neighbours safe', () => {
    const k = classify({ obs: [obs(1, 1, false, false)], wumpusDead: false });
    expect(k.cells[cellIndex(2, 1)].safe).toBe(true);
    expect(k.cells[cellIndex(1, 2)].safe).toBe(true);
    expect(k.cells[cellIndex(2, 2)].safe).toBe(false);
    expect(k.cells[cellIndex(2, 2)].pit).toBe('unknown');
  });
  it('breeze => possible; later no-breeze eliminates; confirms the other', () => {
    const o = [obs(1, 1, false, false), obs(1, 2, true, false, 1)];
    let k = classify({ obs: o, wumpusDead: false });
    expect(k.cells[cellIndex(1, 3)].pit).toBe('possible');
    expect(k.cells[cellIndex(2, 2)].pit).toBe('possible');
    expect(k.cells[cellIndex(2, 2)].safe).toBe(false);
    o.push(obs(2, 1, false, false, 2));
    k = classify({ obs: o, wumpusDead: false });
    expect(k.cells[cellIndex(2, 2)].pit).toBe('none');
    expect(k.cells[cellIndex(1, 3)].pit).toBe('confirmed');
    expect(k.cells[cellIndex(2, 2)].safe).toBe(true);
  });
  it('wumpus deduction (Rule 7)', () => {
    const o = [obs(1, 1, false, false), obs(1, 2, false, false, 1), obs(2, 1, false, true, 2)];
    const k = classify({ obs: o, wumpusDead: false });
    expect(k.cells[cellIndex(3, 1)].wumpus).toBe('confirmed');
    expect(k.cells[cellIndex(2, 2)].wumpus).toBe('none');
  });
  it('dead wumpus clears all wumpus hypotheses', () => {
    const k = classify({ obs: [obs(1, 1, false, true)], wumpusDead: true });
    expect(k.cells.every((c) => c.wumpus === 'none')).toBe(true);
  });
  it('never marks a really dangerous square safe (soundness over many random games)', () => {
    for (let g = 0; g < 40; g++) {
      const w = generateWorld({ difficulty: 'normal' });
      const sim = simulateAgent(w);
      let a = initialAgent(); const o: Observation[] = [];
      const seen = new Set<string>();
      const visit = () => { const k = `${a.x},${a.y}`; if (seen.has(k)) return; seen.add(k); const p = perceptsAt(w, a); o.push({ x: a.x, y: a.y, breeze: p.breeze, stench: p.stench, step: o.length }); };
      visit();
      for (const act of sim.actions) {
        const r = stepWorld(w, a, act); a = r.agent; expect(a.alive).toBe(true); visit();
        const k = classify({ obs: o, wumpusDead: !a.wumpusAlive });
        for (const c of k.cells) if (c.safe) {
          expect(w.pits.some((p) => p.x === c.x && p.y === c.y)).toBe(false);
          if (a.wumpusAlive) expect(w.wumpus.x === c.x && w.wumpus.y === c.y).toBe(false);
        }
      }
    }
  });
});

// Independent brute-force entailment checker over ALL worlds (2^15 pit sets x 15 wumpus squares)
function entails(kb: Clause[], conclusion: Clause[], needsAlive: boolean): boolean {
  const cells = allCells().filter((c) => !(c.x === 1 && c.y === 1));
  const idx = (x: number, y: number) => cells.findIndex((c) => c.x === x && c.y === y);
  for (let m = 0; m < 1 << 15; m++) {
    for (let wi = 0; wi < 15; wi++) {
      if (m & (1 << wi) && false) continue;
      if (m & (1 << wi)) continue; // wumpus and pit never share a square
      const P = (x: number, y: number) => (x === 1 && y === 1 ? false : !!(m & (1 << idx(x, y))));
      const Wm = (x: number, y: number) => cells[wi].x === x && cells[wi].y === y;
      const B = (x: number, y: number) => neighbors(x, y).some((n) => P(n.x, n.y));
      const S = (x: number, y: number) => neighbors(x, y).some((n) => Wm(n.x, n.y));
      const val = (l: { p: string; x: number; y: number; neg?: boolean }) => {
        const v = l.p === 'B' ? B(l.x, l.y) : l.p === 'S' ? S(l.x, l.y) : l.p === 'P' ? P(l.x, l.y) : l.p === 'W' ? Wm(l.x, l.y) : !P(l.x, l.y) && !Wm(l.x, l.y);
        return l.neg ? !v : v;
      };
      if (!kb.every((c) => c.some(val))) continue;
      if (!conclusion.every((c) => c.some(val))) return false;
    }
  }
  return true;
}

describe('inference records are logically sound (KB ⊨ conclusion, verified by brute force)', () => {
  it('every generated record is entailed', () => {
    let checked = 0;
    for (let g = 0; g < 6; g++) {
      const w = generateWorld({ difficulty: 'normal' });
      const sim = simulateAgent(w);
      let a = initialAgent(); let o: Observation[] = [];
      let prev = snapOf({ obs: [], wumpusDead: false });
      const seenK = new Set<string>();
      const observe = (p = perceptsAt(w, a)) => { const k = `${a.x},${a.y}`; if (seenK.has(k)) return false; seenK.add(k); o = [...o, { x: a.x, y: a.y, breeze: p.breeze, stench: p.stench, step: o.length }]; return true; };
      const handle = (screamed = false) => {
        const next = snapOf({ obs: o, wumpusDead: !a.wumpusAlive });
        const recs = deriveRecords(prev, next, o.length, 't', { screamed });
        for (const r of recs) {
          if (r.entail.conclusion.length === 0) continue;
          const concl = r.entail.needsWumpusAlive ? r.entail.conclusion : r.entail.conclusion.filter((c) => c.every((l) => l.p !== 'W')); // dead Wumpus: ¬W follows from the Scream itself
          expect(entails(r.entail.kb, concl, r.entail.needsWumpusAlive), `${r.kind}: ${r.inference.text} KB=${JSON.stringify(r.entail.kb.map((c) => c.map((l) => (l.neg ? "!" : "") + l.p + l.x + l.y)))} obs=${JSON.stringify(o)}`).toBe(true);
          checked++;
        }
        prev = next;
      };
      observe(); handle();
      for (const act of sim.actions) {
        const was = a.wumpusAlive; const r = stepWorld(w, a, act); a = r.agent;
        const isNew = a.alive && observe(r.percepts);
        if (isNew || (was && !a.wumpusAlive)) handle(was && !a.wumpusAlive);
      }
    }
    expect(checked).toBeGreaterThan(20);
  }, 120000);
});
