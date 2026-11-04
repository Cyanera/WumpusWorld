import { Pos, World } from '@/lib/engine/types';
export const mkWorld = (pits: Pos[], wumpus: Pos, gold: Pos): World => ({ pits, wumpus, gold, seed: 't', teaching: { score: 0, notes: [], safeSolvable: true } });
