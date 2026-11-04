import { Pos, neighbors } from './types';

/** Propositional vocabulary used in the "Logical Rules" section. */
export type Pred = 'B' | 'S' | 'P' | 'W' | 'Safe';
export interface Lit { p: Pred; x: number; y: number; neg?: boolean }
export type Clause = Lit[]; // a disjunction of literals

export const lit = (p: Pred, pos: Pos, neg = false): Lit => ({ p, x: pos.x, y: pos.y, neg });
const sym = (p: Pred) => (p === 'Safe' ? '\\mathit{Safe}' : p);
export const litTex = (l: Lit) => `${l.neg ? '\\lnot ' : ''}${sym(l.p)}(${l.x},${l.y})`;
export const litPlain = (l: Lit) => `${l.neg ? '¬' : ''}${l.p}(${l.x},${l.y})`;
export const clauseTex = (c: Clause) => c.map(litTex).join(' \\lor ');
export const clausePlain = (c: Clause) => c.map(litPlain).join(' ∨ ');
export const conjTex = (cs: Clause[]) => cs.map((c) => (c.length > 1 ? `(${clauseTex(c)})` : clauseTex(c))).join(' \\land ');

/** Rule 1 instantiated for square (x,y): B <-> P(adjacent)... */
export function rule1(at: Pos): { tex: string; plain: string } {
  const nb = neighbors(at.x, at.y).map((n) => lit('P', n));
  return { tex: `B(${at.x},${at.y}) \\leftrightarrow ${clauseTex(nb)}`, plain: `B(${at.x},${at.y}) ↔ ${clausePlain(nb)}` };
}
/** Rule 2: no Breeze -> no Pit in every valid neighbour. */
export function rule2(at: Pos): { tex: string; plain: string } {
  const nb = neighbors(at.x, at.y).map((n) => lit('P', n, true));
  return {
    tex: `\\lnot B(${at.x},${at.y}) \\rightarrow ${nb.map(litTex).join(' \\land ')}`,
    plain: `¬B(${at.x},${at.y}) → ${nb.map(litPlain).join(' ∧ ')}`,
  };
}
/** Rule 3 (Wumpus alive). */
export function rule3(at: Pos): { tex: string; plain: string } {
  const nb = neighbors(at.x, at.y).map((n) => lit('W', n));
  return { tex: `S(${at.x},${at.y}) \\leftrightarrow ${clauseTex(nb)}`, plain: `S(${at.x},${at.y}) ↔ ${clausePlain(nb)}` };
}
/** Rule 4 (Wumpus alive). */
export function rule4(at: Pos): { tex: string; plain: string } {
  const nb = neighbors(at.x, at.y).map((n) => lit('W', n, true));
  return {
    tex: `\\lnot S(${at.x},${at.y}) \\rightarrow ${nb.map(litTex).join(' \\land ')}`,
    plain: `¬S(${at.x},${at.y}) → ${nb.map(litPlain).join(' ∧ ')}`,
  };
}
/** Rule 5 */
export const rule5 = (at: Pos) => ({
  tex: `\\mathit{Safe}(${at.x},${at.y}) \\leftrightarrow \\lnot P(${at.x},${at.y}) \\land \\lnot W(${at.x},${at.y})`,
  plain: `Safe(${at.x},${at.y}) ↔ ¬P(${at.x},${at.y}) ∧ ¬W(${at.x},${at.y})`,
});
export const SYMBOL_LEGEND: { sym: string; tex: string; meaning: string }[] = [
  { sym: 'B(x,y)', tex: 'B(x,y)', meaning: 'Breeze at square [x,y]' },
  { sym: 'S(x,y)', tex: 'S(x,y)', meaning: 'Stench at square [x,y]' },
  { sym: 'P(x,y)', tex: 'P(x,y)', meaning: 'Pit at square [x,y]' },
  { sym: 'W(x,y)', tex: 'W(x,y)', meaning: 'Wumpus at square [x,y]' },
  { sym: 'Safe(x,y)', tex: '\\mathit{Safe}(x,y)', meaning: 'Square [x,y] is safe' },
  { sym: '¬', tex: '\\lnot', meaning: 'NOT' },
  { sym: '∧', tex: '\\land', meaning: 'AND' },
  { sym: '∨', tex: '\\lor', meaning: 'OR' },
  { sym: '→', tex: '\\rightarrow', meaning: 'IMPLIES' },
  { sym: '↔', tex: '\\leftrightarrow', meaning: 'IF AND ONLY IF' },
  { sym: '⊨', tex: '\\models', meaning: 'ENTAILS' },
];
