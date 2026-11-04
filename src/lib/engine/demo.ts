import { ActionType, Label, Mode, World, allCells, key } from './types';
import { InferenceRecord } from './reasoner';
import { AttemptPayload, GameEventPayload, GameState, applyAction, engineKnowledge, isOver, newGame, submitCheckpoint } from './game';
import { generateWorld, simulateAgent } from './simulate';
import { TASK_LABELS, expectedLabels } from './checkpoints';

export interface Playthrough { world: World; events: { seq: number; kind: string; payload: GameEventPayload }[]; records: InferenceRecord[]; attempts: AttemptPayload[]; final: GameState }

/** A perfect knowledge-based agent plays a fresh random world in Guided mode, answering every checkpoint correctly. */
export function perfectPlaythrough(world: World = generateWorld({ difficulty: 'normal' }), mode: Mode = 'guided'): Playthrough {
  const { state: s0, out } = newGame('demo', mode, 'normal', undefined, world);
  let state = s0;
  const events: Playthrough['events'] = [{ seq: 0, kind: 'start', payload: out.event }];
  const records: InferenceRecord[] = [...out.records];
  const attempts: AttemptPayload[] = [];
  let n = 0;
  const answerPending = () => {
    while (state.pending.length) {
      const cp = state.pending[0];
      let res;
      if (cp.type === 'mcq') res = submitCheckpoint(state, world, { checkpointId: cp.id, optionId: cp.options!.find((o) => o.correct)!.id }, `d${n++}`);
      else {
        const truth = engineKnowledge(state); const marks: Record<string, Label[]> = {};
        for (const p of allCells()) { const e = expectedLabels(truth, p, cp.taskMode ?? 'full').filter((l) => TASK_LABELS[cp.taskMode ?? 'full'].includes(l)); if (e.length) marks[key(p.x, p.y)] = e; }
        res = submitCheckpoint(state, world, { checkpointId: cp.id, marks }, `d${n++}`);
      }
      if ('error' in res) throw new Error(res.error);
      state = res.state; events.push({ seq: state.seq, kind: 'checkpoint', payload: res.event }); if (res.attempt) attempts.push(res.attempt);
    }
  };
  answerPending();
  for (const act of simulateAgent(world).actions as ActionType[]) {
    if (isOver(state)) break;
    const r = applyAction(state, world, act);
    if ('error' in r) throw new Error(r.error);
    state = r.state; events.push({ seq: state.seq, kind: 'action', payload: r.event }); records.push(...r.records);
    answerPending();
  }
  return { world, events, records, attempts, final: state };
}
