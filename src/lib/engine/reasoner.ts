import {
  CellKnowledge, Knowledge, Observation, PitStatus, Pos, SIZE, WumpusStatus, allCells, cellIndex, fmt, neighbors, posKey,
} from './types';
import {
  Clause, clausePlain, clauseTex, conjTex, lit, litPlain, litTex, rule1, rule2, rule3, rule4, rule5,
} from './formal';

/**
 * Deterministic constraint/model-checking reasoner.
 * Pits are independent per square; there is exactly one Wumpus (while alive).
 * The agent only reasons over what it has observed: visited squares and their percepts.
 */
export interface KBInput { obs: Observation[]; wumpusDead: boolean }

const adj = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function classify(kb: KBInput): Knowledge {
  const visited = new Map<string, Observation>();
  for (const o of kb.obs) visited.set(posKey(o), o);
  const unvisited = allCells().filter((c) => !visited.has(posKey(c)));

  // ---- Pits: enumerate assignments over the frontier F (unvisited squares touching a visited square)
  const F = unvisited.filter((c) => neighbors(c.x, c.y).some((n) => visited.has(posKey(n))));
  const fIdx = new Map(F.map((c, i) => [posKey(c), i]));
  const constraints = [...visited.values()].map((o) => {
    let mask = 0;
    for (const n of neighbors(o.x, o.y)) { const i = fIdx.get(posKey(n)); if (i !== undefined) mask |= 1 << i; }
    return { mask, breeze: o.breeze };
  });
  let count = 0;
  const hit = new Array(F.length).fill(0);
  for (let m = 0; m < 1 << F.length; m++) {
    let ok = true;
    for (const c of constraints) if (((m & c.mask) !== 0) !== c.breeze) { ok = false; break; }
    if (!ok) continue;
    count++;
    for (let i = 0; i < F.length; i++) if (m & (1 << i)) hit[i]++;
  }
  const pit = new Map<string, PitStatus>();
  for (const c of unvisited) {
    const i = fIdx.get(posKey(c));
    if (i === undefined || count === 0) pit.set(posKey(c), 'unknown');
    else pit.set(posKey(c), hit[i] === 0 ? 'none' : hit[i] === count ? 'confirmed' : 'possible');
  }

  // ---- Wumpus: exactly one, in an unvisited square, consistent with every stench observation
  const wumpus = new Map<string, WumpusStatus>();
  if (kb.wumpusDead) {
    for (const c of unvisited) wumpus.set(posKey(c), 'none');
  } else {
    const cand = unvisited.filter((c) => [...visited.values()].every((o) => adj(o, c) === o.stench));
    const set = new Set(cand.map(posKey));
    const stenchCells = [...visited.values()].filter((o) => o.stench);
    for (const c of unvisited) {
      const k = posKey(c);
      if (cand.length === 0) wumpus.set(k, 'unknown');
      else if (!set.has(k)) wumpus.set(k, 'none');
      else if (cand.length === 1) wumpus.set(k, 'confirmed');
      else wumpus.set(k, stenchCells.some((o) => adj(o, c)) ? 'possible' : 'unknown');
    }
  }

  const cells: CellKnowledge[] = allCells().map((c) => {
    const k = posKey(c);
    if (visited.has(k)) return { x: c.x, y: c.y, visited: true, pit: 'none', wumpus: 'none', safe: true };
    const p = pit.get(k)!, w = wumpus.get(k)!;
    return { x: c.x, y: c.y, visited: false, pit: p, wumpus: w, safe: p === 'none' && w === 'none' };
  });
  return { cells, wumpusDead: kb.wumpusDead };
}

export const cellOf = (k: Knowledge, x: number, y: number) => k.cells[cellIndex(x, y)];
export const safeUnvisited = (k: Knowledge) => k.cells.filter((c) => c.safe && !c.visited);

export function emptyKnowledge(): Knowledge {
  return classify({ obs: [], wumpusDead: false });
}

/** Compact snapshot for event logs/replay: one string per cell "vsPW" (visited,safe,pit,wumpus). */
export function compact(k: Knowledge): string[] {
  return k.cells.map((c) => `${c.visited ? 'v' : '-'}${c.safe ? 's' : '-'}${c.pit[0]}${c.wumpus[0]}`);
}
export function expand(cs: string[], wumpusDead = false): Knowledge {
  const P: Record<string, PitStatus> = { n: 'none', p: 'possible', c: 'confirmed', u: 'unknown' };
  const W: Record<string, WumpusStatus> = { n: 'none', p: 'possible', c: 'confirmed', u: 'unknown' };
  return {
    wumpusDead,
    cells: cs.map((s, i) => ({ x: (i % SIZE) + 1, y: Math.floor(i / SIZE) + 1, visited: s[0] === 'v', safe: s[1] === 's', pit: P[s[2]], wumpus: W[s[3]] })),
  };
}

// ---------------------------------------------------------------------------------------------
// Structured inference records (evidence + natural-language + formal logic, all instantiated)
// ---------------------------------------------------------------------------------------------
export type RecordKind =
  | 'no_breeze' | 'breeze' | 'no_stench' | 'stench' | 'eliminate_pit' | 'eliminate_wumpus'
  | 'confirm_pit' | 'confirm_wumpus' | 'safe' | 'wumpus_dead';

export interface Fragment { text: string; tex: string }
export interface InferenceRecord {
  id: string; step: number; ts: string; kind: RecordKind;
  ruleName: string;             // e.g. "Rule 2 · No Breeze"
  observation: Fragment | null; // the percept used
  previous: Fragment[];         // earlier knowledge used
  ruleFormal: Fragment;         // instantiated rule
  inference: Fragment;          // resulting conclusion
  update: string;               // KB update description
  squares: Pos[];               // squares to highlight
  eliminated: { pos: Pos; what: 'pit' | 'wumpus' }[]; // possibilities removed
  assumptions: string[];
  /** For the Entailment preview and for machine verification: KB ⊨ conclusion (given the world axioms) */
  entail: { kb: Clause[]; conclusion: Clause[]; needsWumpusAlive: boolean };
}

const cl = (c: Clause): Fragment => ({ text: clausePlain(c), tex: clauseTex(c) });
const list = (ps: Pos[]) => ps.map(fmt).join(', ');
const obsLit = (o: Observation, pred: 'B' | 'S'): Clause => [lit(pred, o, !(pred === 'B' ? o.breeze : o.stench))];

export function allObsClauses(obs: Observation[], wumpusDead: boolean): Clause[] {
  const out: Clause[] = [];
  for (const o of obs) {
    out.push(obsLit(o, 'B'));
    if (!wumpusDead) out.push(obsLit(o, 'S'));
  }
  return out;
}

const visitedFacts = (obs: Observation[], pred: 'P' | 'W'): Clause[] => obs.map((o) => [lit(pred, o, true)]);

interface Snap { obs: Observation[]; wumpusDead: boolean; k: Knowledge }
export const snapOf = (kb: KBInput): Snap => ({ ...kb, k: classify(kb) });

/**
 * Derive the structured inference records created by the transition `before -> after`.
 * Everything is generated from the real observations and the reasoner's own statuses.
 */
export function deriveRecords(before: Snap, after: Snap, step: number, ts: string, opts: { screamed?: boolean } = {}): InferenceRecord[] {
  const out: InferenceRecord[] = [];
  const mk = (r: Omit<InferenceRecord, 'id' | 'step' | 'ts'>) =>
    out.push({ ...r, id: `s${step}-${out.length}`, step, ts });
  const alive = !after.wumpusDead;
  const aliveAssumption = 'The Wumpus is alive and there is exactly one Wumpus.';
  const newObs = after.obs.find((o) => !before.obs.some((p) => p.x === o.x && p.y === o.y));
  const lastKnownCell = (k: Knowledge, p: Pos) => k.cells[cellIndex(p.x, p.y)];

  if (opts.screamed) {
    mk({
      kind: 'wumpus_dead', ruleName: 'Rule 3/4 no longer applies',
      observation: { text: 'I heard a Scream.', tex: '\\text{Scream}' }, previous: [],
      ruleFormal: { text: 'Scream → the Wumpus is dead, so it cannot be in any square.', tex: '\\text{Scream} \\rightarrow \\lnot W(a,b)\\ \\text{for every square}' },
      inference: { text: 'The Wumpus is dead. No square contains a Wumpus.', tex: '\\lnot W(a,b)\\ \\text{for all } (a,b)' },
      update: 'All possible/confirmed Wumpus squares were eliminated.',
      squares: before.k.cells.filter((c) => c.wumpus === 'possible' || c.wumpus === 'confirmed').map((c) => ({ x: c.x, y: c.y })),
      eliminated: before.k.cells.filter((c) => c.wumpus === 'possible' || c.wumpus === 'confirmed').map((c) => ({ pos: { x: c.x, y: c.y }, what: 'wumpus' as const })),
      assumptions: [], entail: { kb: [], conclusion: [], needsWumpusAlive: false },
    });
  }

  if (newObs) {
    const v = newObs;
    const nb = neighbors(v.x, v.y);
    const bPrev = [...new Set(before.obs.filter((o) => o.breeze).map(posKey))];
    // ----- Breeze side
    if (!v.breeze) {
      const elim = nb.filter((n) => before.k.cells[cellIndex(n.x, n.y)].pit === 'possible' || before.k.cells[cellIndex(n.x, n.y)].pit === 'unknown');
      const hadPossible = nb.some((n) => before.k.cells[cellIndex(n.x, n.y)].pit === 'possible');
      const prev: Fragment[] = [];
      const prevClauses: Clause[] = [];
      for (const key of bPrev) {
        const o = before.obs.find((q) => posKey(q) === key)!;
        const touched = nb.filter((n) => adj(n, o));
        if (touched.length) {
          const cand = candidatesAt(before, o);
          prev.push({ text: `Earlier: Breeze at ${fmt(o)}, so ${clausePlain(cand)}`, tex: clauseTex(cand) });
          prevClauses.push(cand);
        }
      }
      const rule = rule2(v);
      mk({
        kind: hadPossible ? 'eliminate_pit' : 'no_breeze', ruleName: 'Rule 2 · No Breeze',
        observation: { text: `No Breeze at ${fmt(v)}.`, tex: `\\lnot B(${v.x},${v.y})` }, previous: prev,
        ruleFormal: { text: rule.plain, tex: rule.tex },
        inference: { text: `No Pit in ${list(nb)}.`, tex: nb.map((n) => litTex(lit('P', n, true))).join(' \\land ') },
        update: elim.length
          ? `${hadPossible ? 'Eliminated possible Pits' : 'Ruled out Pits'} at ${list(elim)}.`
          : `Confirmed that ${list(nb)} are Pit-free (already known).`,
        squares: [v, ...nb], eliminated: elim.map((pos) => ({ pos, what: 'pit' as const })),
        assumptions: [],
        entail: { kb: [obsLit(v, 'B'), ...prevClauses], conclusion: nb.map((n) => [lit('P', n, true)]), needsWumpusAlive: false },
      });
    } else {
      const cand = candidatesAt(after, v);
      const known = nb.filter((n) => before.k.cells[cellIndex(n.x, n.y)].pit === 'none');
      const rule = rule1(v);
      mk({
        kind: 'breeze', ruleName: 'Rule 1 · Breeze Detection',
        observation: { text: `Breeze at ${fmt(v)}.`, tex: `B(${v.x},${v.y})` },
        previous: known.map((n) => ({ text: `${fmt(n)} has no Pit.`, tex: litTex(lit('P', n, true)) })),
        ruleFormal: { text: rule.plain, tex: rule.tex },
        inference: cl(cand),
        update: cand.length === 1 ? `Only one candidate remains: ${fmt({ x: cand[0].x, y: cand[0].y })}.` : `Possible Pit at ${list(cand)} (at least one of them is a Pit).`,
        squares: [v, ...cand], eliminated: [],
        assumptions: [],
        entail: { kb: [obsLit(v, 'B'), ...known.map((n) => [lit('P', n, true)])], conclusion: [cand], needsWumpusAlive: false },
      });
    }
    // ----- Stench side (only while the Wumpus is alive)
    if (alive) {
      if (!v.stench) {
        const elim = nb.filter((n) => ['possible', 'unknown'].includes(before.k.cells[cellIndex(n.x, n.y)].wumpus));
        const hadPossible = nb.some((n) => before.k.cells[cellIndex(n.x, n.y)].wumpus === 'possible');
        const rule = rule4(v);
        const prev: Fragment[] = [];
        for (const o of before.obs.filter((q) => q.stench)) {
          const cand = wCandidatesAt(before, o);
          if (nb.some((n) => cand.some((c) => c.x === n.x && c.y === n.y))) prev.push({ text: `Earlier: Stench at ${fmt(o)}, so ${clausePlain(cand)}`, tex: clauseTex(cand) });
        }
        mk({
          kind: hadPossible ? 'eliminate_wumpus' : 'no_stench', ruleName: 'Rule 4 · No Stench',
          observation: { text: `No Stench at ${fmt(v)}.`, tex: `\\lnot S(${v.x},${v.y})` }, previous: prev,
          ruleFormal: { text: rule.plain, tex: rule.tex },
          inference: { text: `No Wumpus in ${list(nb)}.`, tex: nb.map((n) => litTex(lit('W', n, true))).join(' \\land ') },
          update: elim.length ? `${hadPossible ? 'Eliminated possible Wumpus' : 'Ruled out the Wumpus'} at ${list(elim)}.` : `${list(nb)} were already known to be Wumpus-free.`,
          squares: [v, ...nb], eliminated: elim.map((pos) => ({ pos, what: 'wumpus' as const })),
          assumptions: [aliveAssumption],
          entail: { kb: [obsLit(v, 'S')], conclusion: nb.map((n) => [lit('W', n, true)]), needsWumpusAlive: true },
        });
      } else {
        const cand = wCandidatesAt(after, v);
        const known = nb.filter((n) => before.k.cells[cellIndex(n.x, n.y)].wumpus === 'none');
        const rule = rule3(v);
        mk({
          kind: 'stench', ruleName: 'Rule 3 · Stench Detection',
          observation: { text: `Stench at ${fmt(v)}.`, tex: `S(${v.x},${v.y})` },
          previous: known.map((n) => ({ text: `${fmt(n)} has no Wumpus.`, tex: litTex(lit('W', n, true)) })),
          ruleFormal: { text: rule.plain, tex: rule.tex }, inference: cl(cand),
          update: cand.length === 1 ? `Only one candidate remains: ${fmt({ x: cand[0].x, y: cand[0].y })}.` : `Possible Wumpus at ${list(cand)} (it is in exactly one of them).`,
          squares: [v, ...cand], eliminated: [],
          assumptions: [aliveAssumption],
          entail: { kb: [obsLit(v, 'S'), ...known.map((n) => [lit('W', n, true)])], conclusion: [cand], needsWumpusAlive: true },
        });
      }
    }
  }

  // ----- Confirmations (Rule 6 / 7 style: combine a disjunction with eliminations)
  for (const c of after.k.cells) {
    const b = lastKnownCell(before.k, c);
    if (c.visited) continue;
    if (c.pit === 'confirmed' && b.pit !== 'confirmed') {
      const u = after.obs.find((o) => o.breeze && adj(o, c) && neighbors(o.x, o.y).every((n) => (n.x === c.x && n.y === c.y) || cellOf(after.k, n.x, n.y).pit === 'none')
        && candidatesAt(snapAt(after, o), o).every((n) => (n.x === c.x && n.y === c.y) || after.obs.some((q) => !q.breeze && adj(q, n))));
      const prev: Fragment[] = []; const kb: Clause[] = [...visitedFacts(after.obs, 'P')]; const elim: { pos: Pos; what: 'pit' }[] = [];
      if (u) {
        const cand = candidatesAt(snapAt(after, u), u);
        prev.push({ text: `Breeze at ${fmt(u)} gave: ${clausePlain(cand)}`, tex: clauseTex(cand) });
        kb.push(obsLit(u, 'B'));
        for (const n of cand) if (!(n.x === c.x && n.y === c.y)) {
          const t = after.obs.find((o) => !o.breeze && adj(o, n))!;
          prev.push({ text: `No Breeze at ${fmt(t)} → no Pit at ${fmt(n)}`, tex: `\\lnot B(${t.x},${t.y}) \\rightarrow \\lnot P(${n.x},${n.y})` });
          kb.push(obsLit(t, 'B')); elim.push({ pos: n, what: 'pit' });
        }
      }
      kb.push(...allObsClauses(after.obs, true).filter((q) => q[0].p === 'B'));
      mk({
        kind: 'confirm_pit', ruleName: 'Rule 6 · Combining Knowledge',
        observation: u ? { text: `Breeze at ${fmt(u)}.`, tex: `B(${u.x},${u.y})` } : null, previous: prev,
        ruleFormal: u ? { text: `${clausePlain(candidatesAt(snapAt(after, u), u))}, with all other disjuncts false, leaves one`, tex: `\\mathrm{KB} \\models P(${c.x},${c.y})` } : { text: 'Combine all Breeze observations.', tex: `\\mathrm{KB} \\models P(${c.x},${c.y})` },
        inference: { text: `Pit confirmed at ${fmt(c)}.`, tex: litTex(lit('P', c)) },
        update: `Pit confirmed at ${fmt(c)}.`, squares: [c, ...(u ? [u] : [])], eliminated: elim, assumptions: [],
        entail: { kb, conclusion: [[lit('P', c)]], needsWumpusAlive: false },
      });
    }
    if (c.wumpus === 'confirmed' && b.wumpus !== 'confirmed' && alive) {
      const u = after.obs.find((o) => o.stench && adj(o, c) && neighbors(o.x, o.y).every((n) => (n.x === c.x && n.y === c.y) || cellOf(after.k, n.x, n.y).wumpus === 'none')
        && wCandidatesAt(snapAt(after, o), o).every((n) => (n.x === c.x && n.y === c.y) || after.obs.some((q) => !q.stench && adj(q, n))));
      const prev: Fragment[] = []; const kb: Clause[] = [...visitedFacts(after.obs, 'W')]; const elim: { pos: Pos; what: 'wumpus' }[] = [];
      if (u) {
        const cand = wCandidatesAt(snapAt(after, u), u);
        prev.push({ text: `Stench at ${fmt(u)} gave: ${clausePlain(cand)}`, tex: clauseTex(cand) });
        kb.push(obsLit(u, 'S'));
        for (const n of cand) if (!(n.x === c.x && n.y === c.y)) {
          const t = after.obs.find((o) => !o.stench && adj(o, n))!;
          prev.push({ text: `No Stench at ${fmt(t)} → no Wumpus at ${fmt(n)}`, tex: `\\lnot S(${t.x},${t.y}) \\rightarrow \\lnot W(${n.x},${n.y})` });
          kb.push(obsLit(t, 'S')); elim.push({ pos: n, what: 'wumpus' });
        }
      }
      kb.push(...allObsClauses(after.obs, false).filter((q) => q[0].p === 'S'));
      mk({
        kind: 'confirm_wumpus', ruleName: 'Rule 7 · Wumpus Deduction',
        observation: u ? { text: `Stench at ${fmt(u)}.`, tex: `S(${u.x},${u.y})` } : null, previous: prev,
        ruleFormal: { text: 'Combine the Stench disjunction with earlier No-Stench observations.', tex: `\\mathrm{KB} \\models W(${c.x},${c.y})` },
        inference: { text: `Wumpus confirmed at ${fmt(c)}.`, tex: litTex(lit('W', c)) },
        update: `Wumpus confirmed at ${fmt(c)}.`, squares: [c, ...(u ? [u] : [])], eliminated: elim, assumptions: [aliveAssumption],
        entail: { kb, conclusion: [[lit('W', c)]], needsWumpusAlive: true },
      });
    }
  }

  // ----- Newly safe squares (Rule 5)
  for (const c of after.k.cells) {
    if (c.visited || !c.safe || before.k.cells[cellIndex(c.x, c.y)].safe) continue;
    const pos = { x: c.x, y: c.y };
    const tB = after.obs.find((o) => !o.breeze && adj(o, pos))!;
    const prev: Fragment[] = [{ text: `No Pit at ${fmt(pos)} (No Breeze at ${fmt(tB)}).`, tex: litTex(lit('P', pos, true)) }];
    const kb: Clause[] = [obsLit(tB, 'B'), ...visitedFacts(after.obs, 'W')];
    let needsAlive = false;
    if (after.wumpusDead) prev.push({ text: 'The Wumpus is dead.', tex: '\\text{Scream}' });
    else {
      const tS = after.obs.find((o) => !o.stench && adj(o, pos));
      if (tS) { prev.push({ text: `No Wumpus at ${fmt(pos)} (No Stench at ${fmt(tS)}).`, tex: litTex(lit('W', pos, true)) }); kb.push(obsLit(tS, 'S')); }
      else { prev.push({ text: `No Wumpus at ${fmt(pos)} (ruled out by the other Stench/No-Stench evidence).`, tex: litTex(lit('W', pos, true)) }); kb.push(...allObsClauses(after.obs, false).filter((q) => q[0].p === 'S')); }
      needsAlive = true;
    }
    const r5 = rule5(pos);
    mk({
      kind: 'safe', ruleName: 'Rule 5 · Safe Square', observation: null, previous: prev,
      ruleFormal: { text: r5.plain, tex: r5.tex },
      inference: { text: `${fmt(pos)} is safe.`, tex: litTex(lit('Safe', pos)) },
      update: `${fmt(pos)} added to the known-safe squares.`, squares: [pos], eliminated: [],
      assumptions: needsAlive ? [aliveAssumption] : [],
      entail: { kb, conclusion: [[lit('P', pos, true)], [lit('W', pos, true)]], needsWumpusAlive: needsAlive },
    });
  }
  return out;
}

/** Pit candidates of a visited breezy square u *at the time it was visited*. */
function candidatesAt(s: Snap, u: Pos): Clause {
  const at = snapAt(s, u);
  const cands = neighbors(u.x, u.y).filter((n) => cellOf(at.k, n.x, n.y).pit !== 'none' && !cellOf(at.k, n.x, n.y).visited);
  return cands.map((n) => lit('P', n));
}
function wCandidatesAt(s: Snap, u: Pos): Clause {
  const at = snapAt(s, u);
  const cands = neighbors(u.x, u.y).filter((n) => cellOf(at.k, n.x, n.y).wumpus !== 'none' && !cellOf(at.k, n.x, n.y).visited);
  return cands.map((n) => lit('W', n));
}
/** Snapshot of the knowledge just BEFORE u was observed (+ u's own observation excluded). */
function snapAt(s: Snap, u: Pos): Snap {
  const idx = s.obs.findIndex((o) => o.x === u.x && o.y === u.y);
  const obs = idx < 0 ? s.obs : s.obs.slice(0, idx);
  const wumpusDead = false;
  return { obs, wumpusDead, k: classify({ obs, wumpusDead }) };
}

export { conjTex, litPlain };
export const RULE_TITLES = ['Rule 1 · Breeze Detection', 'Rule 2 · No Breeze', 'Rule 3 · Stench Detection', 'Rule 4 · No Stench', 'Rule 5 · Safe Square', 'Rule 6 · Combining Knowledge', 'Rule 7 · Wumpus Deduction'];
