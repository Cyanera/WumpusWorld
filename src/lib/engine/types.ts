export const SIZE = 4;
export type Dir = 'E' | 'N' | 'W' | 'S';
export const DIRS: Dir[] = ['E', 'N', 'W', 'S']; // counter-clockwise order
export const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  E: { dx: 1, dy: 0 }, N: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 }, S: { dx: 0, dy: -1 },
};
export interface Pos { x: number; y: number }
export type ActionType = 'turn_left' | 'turn_right' | 'forward' | 'grab' | 'shoot' | 'climb';
export const ACTIONS: ActionType[] = ['turn_left', 'turn_right', 'forward', 'grab', 'shoot', 'climb'];
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Mode = 'guided' | 'challenge';

/** Hidden world: NEVER sent to student clients before it is legitimately revealed. */
export interface World {
  pits: Pos[];
  wumpus: Pos;
  gold: Pos;
  seed: string;
  teaching: { score: number; notes: string[]; safeSolvable: boolean };
}

export interface Percepts { stench: boolean; breeze: boolean; glitter: boolean; bump: boolean; scream: boolean }
export const NO_PERCEPTS: Percepts = { stench: false, breeze: false, glitter: false, bump: false, scream: false };

export type Outcome = 'playing' | 'won' | 'escaped_no_gold' | 'dead' | 'timeout';
export interface AgentState {
  x: number; y: number; dir: Dir; alive: boolean; hasGold: boolean; hasArrow: boolean;
  wumpusAlive: boolean; score: number; actions: number; outcome: Outcome; deathCause?: 'pit' | 'wumpus';
}

/** Percepts the agent got when it stood in a cell (history). */
export interface Observation { x: number; y: number; breeze: boolean; stench: boolean; step: number }

export type PitStatus = 'none' | 'possible' | 'confirmed' | 'unknown';
export type WumpusStatus = 'none' | 'possible' | 'confirmed' | 'unknown';
export interface CellKnowledge {
  x: number; y: number; visited: boolean; pit: PitStatus; wumpus: WumpusStatus; safe: boolean;
}
export interface Knowledge {
  cells: CellKnowledge[]; // 16 entries, row-major from y=1
  wumpusDead: boolean;
}

export type Label = 'safe' | 'possible_pit' | 'confirmed_pit' | 'possible_wumpus' | 'confirmed_wumpus' | 'unknown';
export const LABELS: Label[] = ['safe', 'possible_pit', 'confirmed_pit', 'possible_wumpus', 'confirmed_wumpus', 'unknown'];

export const key = (x: number, y: number) => `${x},${y}`;
export const posKey = (p: Pos) => key(p.x, p.y);
export const cellIndex = (x: number, y: number) => (y - 1) * SIZE + (x - 1);
export const inGrid = (x: number, y: number) => x >= 1 && x <= SIZE && y >= 1 && y <= SIZE;
export const neighbors = (x: number, y: number): Pos[] =>
  [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }].filter((p) => inGrid(p.x, p.y));
export const allCells = (): Pos[] => {
  const r: Pos[] = [];
  for (let y = 1; y <= SIZE; y++) for (let x = 1; x <= SIZE; x++) r.push({ x, y });
  return r;
};
export const fmt = (p: Pos | { x: number; y: number }) => `[${p.x},${p.y}]`;
