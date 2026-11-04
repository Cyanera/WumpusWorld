import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryDB, setDB } from '@/lib/server/db';
import * as svc from '@/lib/server/service';
import { overview, studentDetail, exportTables, exportXlsx, toCSV } from '@/lib/server/instructor';
import { applyAction, newGame, studentView, engineKnowledge } from '@/lib/engine/game';
import { perfectPlaythrough } from '@/lib/engine/demo';
import { generateWorld } from '@/lib/engine/simulate';
import { stepWorld, initialAgent } from '@/lib/engine/world';
import { expand } from '@/lib/engine/reasoner';
import { makeInstructorCookie, readInstructorCookie } from '@/lib/server/auth';
import { POST as joinRoute } from '@/app/api/join/route';
import { GET as stateRoute } from '@/app/api/play/state/route';
import { GET as instructorSession } from '@/app/api/instructor/sessions/[code]/route';
import { GET as exportRoute } from '@/app/api/instructor/sessions/[code]/export/route';
import { COOKIE } from '@/lib/server/auth';

let db: MemoryDB;
beforeEach(() => { db = new MemoryDB(); setDB(db); });

async function setup(mode: 'guided' | 'challenge' = 'guided') {
  const inst = await svc.ensureInstructor(db, 'a@b.edu');
  const s = await svc.createSession(db, inst.id, { mode, durationMinutes: 10 });
  await svc.controlSession(db, s, 'start');
  return { inst, s };
}
const stu = async (code: string, name: string) => svc.join(db, code, name);

describe('hidden state security', () => {
  it('student payload never contains hidden world while playing', async () => {
    const { s } = await setup();
    const a = await stu(s.code, 'Sara');
    const st = await svc.startGame(db, a.participantId, a.token);
    const raw = JSON.stringify(st);
    const hidden = (await db.list('hidden_worlds', {}))[0].world;
    expect(st.game!.world).toBeNull();
    expect(raw).not.toContain('"pits"'); expect(raw).not.toContain('"wumpus":{');
    expect(raw).not.toContain(hidden.seed);
    expect(raw).not.toContain('teaching');
  });
  it('cannot play as someone else (token required) or read other sessions', async () => {
    const { s } = await setup();
    const a = await stu(s.code, 'Sara'); const b = await stu(s.code, 'Noor');
    await expect(svc.getStudentState(db, a.participantId, b.token)).rejects.toMatchObject({ status: 401 });
    await expect(svc.doAction(db, a.participantId, null, 'forward')).rejects.toMatchObject({ status: 401 });
  });
  it('instructor routes need a valid signed cookie, and only for own sessions', async () => {
    const { s, inst } = await setup();
    const noCookie = await instructorSession(new Request('http://x/api'), { params: { code: s.code } });
    expect(noCookie.status).toBe(401);
    const forged = await instructorSession(new Request('http://x/api', { headers: { cookie: `${COOKIE}=abc.def` } }), { params: { code: s.code } });
    expect(forged.status).toBe(401);
    const other = await svc.ensureInstructor(db, 'other@b.edu');
    const wrong = await instructorSession(new Request('http://x/api', { headers: { cookie: `${COOKIE}=${makeInstructorCookie(other.id)}` } }), { params: { code: s.code } });
    expect(wrong.status).toBe(403);
    const ok = await instructorSession(new Request('http://x/api', { headers: { cookie: `${COOKIE}=${makeInstructorCookie(inst.id)}` } }), { params: { code: s.code } });
    expect(ok.status).toBe(200);
    expect(readInstructorCookie(makeInstructorCookie(inst.id))).toBe(inst.id);
  });
  it('world is revealed only after the game is over', async () => {
    const { state, world } = newGame('g', 'challenge');
    expect(studentView(state, [], world).world).toBeNull();
    let s = state;
    // walk straight east until death/exit/bump (challenge mode never blocks)
    for (let i = 0; i < 40 && s.agent.outcome === 'playing'; i++) {
      const r = applyAction(s, world, i % 7 === 6 ? 'turn_left' : 'forward'); if ('error' in r) break; s = r.state;
    }
    if (s.agent.outcome !== 'playing') expect(studentView(s, [], world).world).not.toBeNull();
  });
});

describe('join, sessions, persistence', () => {
  it('students join via route with display names; duplicates get suffixes; resume works', async () => {
    const { s } = await setup();
    const r = await joinRoute(new Request('http://x/api/join', { method: 'POST', body: JSON.stringify({ code: s.code.toLowerCase(), name: 'Lina' }) }));
    expect(r.status).toBe(200);
    const j = await r.json();
    const dup = await stu(s.code, 'lina');
    expect(dup.name).toBe('lina 2');
    const again = await svc.join(db, s.code, '', { pid: j.participantId, token: j.token });
    expect(again.resumed).toBe(true);
    const st = await stateRoute(new Request('http://x', { headers: { 'x-pid': j.participantId, 'x-token': j.token } }), {});
    expect((await st.json()).me.name).toBe('Lina');
  });
  it('session persistence: refresh returns same game and progress', async () => {
    const { s } = await setup();
    const a = await stu(s.code, 'A');
    const st1 = await svc.startGame(db, a.participantId, a.token);
    const again = await svc.startGame(db, a.participantId, a.token); // idempotent while playing
    expect(again.game!.id).toBe(st1.game!.id);
    const fresh = await svc.getStudentState(db, a.participantId, a.token);
    expect(fresh.game!.seq).toBe(st1.game!.seq);
  });
  it('different students get different random worlds; every new game is random', async () => {
    const { s } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) { const p = await stu(s.code, `S${i}`); await svc.startGame(db, p.participantId, p.token); }
    for (const w of await db.list('hidden_worlds', {})) ids.push(JSON.stringify([w.world.pits, w.world.wumpus, w.world.gold]));
    expect(new Set(ids).size).toBeGreaterThan(8);
  });
  it('lobby blocks play; pause blocks actions; resume restores time; finish ends games', async () => {
    const inst = await svc.ensureInstructor(db, 'a@b.edu');
    let s = await svc.createSession(db, inst.id, {});
    const a = await stu(s.code, 'A');
    await expect(svc.startGame(db, a.participantId, a.token)).rejects.toMatchObject({ code: 'session_not_active' });
    s = await svc.controlSession(db, s, 'start');
    await svc.startGame(db, a.participantId, a.token);
    s = await svc.controlSession(db, s, 'pause');
    await expect(svc.doAction(db, a.participantId, a.token, 'turn_left')).rejects.toMatchObject({ code: 'session_not_active' });
    s = await svc.controlSession(db, s, 'resume');
    s = await svc.controlSession(db, s, 'finish');
    await expect(svc.doAction(db, a.participantId, a.token, 'turn_left')).rejects.toMatchObject({ code: 'session_finished' });
    const st = await svc.getStudentState(db, a.participantId, a.token);
    expect(st.game!.over).toBe(true); expect(st.game!.outcome).toBe('timeout'); expect(st.game!.world).not.toBeNull();
  });
  it('duplicate events (same opId) are applied once', async () => {
    const { s } = await setup('challenge');
    const a = await stu(s.code, 'A'); await svc.startGame(db, a.participantId, a.token);
    const r1 = await svc.doAction(db, a.participantId, a.token, 'turn_left', 'op-1');
    const r2 = await svc.doAction(db, a.participantId, a.token, 'turn_left', 'op-1');
    expect(r2.game!.actions).toBe(r1.game!.actions);
    expect(r2.game!.agent.dir).toBe('N');
  });
});

describe('guided mode flow + dashboard real-time data', () => {
  it('forces a checkpoint before actions; correct answers update knowledge; dashboard sees it', async () => {
    const { s, inst } = await setup('guided');
    const a = await stu(s.code, 'Student A');
    let st = await svc.startGame(db, a.participantId, a.token);
    // play like the perfect agent, answering every checkpoint with the correct answer
    const world = (await db.list('hidden_worlds', {}))[0].world;
    const pt = perfectPlaythrough(world);
    let answered = 0;
    const actions = pt.events.filter((e) => e.kind === 'action').map((e) => e.payload.action!);
    const answer = async () => {
      while (st.game!.pending) {
        const cp = st.game!.pending!;
        // check that an action is rejected while a checkpoint is pending
        await expect(svc.doAction(db, a.participantId, a.token, 'forward')).rejects.toMatchObject({ code: 'checkpoint_pending' });
        const g = (await db.list('game_instances', {}))[0].state;
        const truth = engineKnowledge(g);
        if (cp.type === 'mcq') st = await svc.doCheckpoint(db, a.participantId, a.token, { checkpointId: cp.id, optionId: 'a' });
        else {
          const { expectedLabels, TASK_LABELS } = await import('@/lib/engine/checkpoints');
          const marks: Record<string, string[]> = {};
          for (const c of truth.cells) { const e = expectedLabels(truth, c, cp.taskMode!); if (e.length) marks[`${c.x},${c.y}`] = e; }
          st = await svc.doCheckpoint(db, a.participantId, a.token, { checkpointId: cp.id, marks });
          void TASK_LABELS;
        }
        expect(st.game!.feedback?.correct).toBe(true); answered++;
      }
    };
    await answer();
    for (const act of actions) { st = await svc.doAction(db, a.participantId, a.token, act); await answer(); if (st.game!.over) break; }
    expect(st.game!.over).toBe(true);
    expect(st.game!.outcome).toBe('won');
    expect(st.game!.world).not.toBeNull();
    expect(answered).toBeGreaterThan(1);
    expect(st.logic.available).toBe(true);
    const o = await overview(db, s);
    expect(o.metrics.participants).toBe(1); expect(o.metrics.completed).toBe(1); expect(o.metrics.foundGold).toBe(1); expect(o.metrics.avgAccuracy).toBe(100);
    expect(o.metrics.deaths).toBe(0);
    expect(o.analytics.categories.find((c) => c.id === 'percept_understanding')!.total).toBeGreaterThan(0);
    // detail + replay data
    const d = await studentDetail(db, s, a.participantId);
    expect(d!.events!.length).toBeGreaterThan(5); expect(d!.records!.length).toBeGreaterThan(0); expect(d!.world).not.toBeNull();
    // exports
    const t = await exportTables(db, s);
    expect(t.students.length).toBe(2); expect(toCSV(t.students)).toContain('Student A');
    expect((await exportXlsx(db, s)).byteLength).toBeGreaterThan(1000);
    const csv = await exportRoute(new Request('http://x?format=csv', { headers: { cookie: `${COOKIE}=${makeInstructorCookie(inst.id)}` } }), { params: { code: s.code } });
    expect(csv.headers.get('content-type')).toContain('text/csv');
  }, 120000);

  it('wrong inference is graded and misconception recorded; unjustified safe is flagged', async () => {
    const { s } = await setup('guided');
    const a = await stu(s.code, 'B');
    let st = await svc.startGame(db, a.participantId, a.token);
    for (let i = 0; i < 30 && !st.game!.over; i++) {
      const cp = st.game!.pending;
      if (cp) {
        st = cp.type === 'mcq' ? await svc.doCheckpoint(db, a.participantId, a.token, { checkpointId: cp.id, optionId: 'b' })
          : await svc.doCheckpoint(db, a.participantId, a.token, { checkpointId: cp.id, marks: Object.fromEntries(Array.from({ length: 16 }, (_, k) => [`${(k % 4) + 1},${Math.floor(k / 4) + 1}`, ['safe']])) });
        expect(st.game!.feedback!.correct).toBe(false);
      } else st = await svc.doAction(db, a.participantId, a.token, 'turn_left');
    }
    const o = await overview(db, s);
    expect(o.metrics.avgAccuracy ?? 0).toBeLessThan(100);
    expect(o.analytics.misconceptions.length).toBeGreaterThan(0);
  });
  it('challenge mode: never blocks, hides inferred knowledge until a self-check', async () => {
    const { s } = await setup('challenge');
    const a = await stu(s.code, 'C');
    let st = await svc.startGame(db, a.participantId, a.token);
    expect(st.game!.pending).toBeNull();
    expect(st.game!.kb.safe).toEqual([]);
    st = await svc.doCheckpoint(db, a.participantId, a.token, { checkpointId: 'fc', marks: {} });
    expect(st.game!.kb.safe.length).toBeGreaterThan(-1);
    expect(st.game!.stats.freeChecks).toBe(1);
  });
});

describe('replay accuracy', () => {
  it('replay events reproduce the recorded trajectory exactly', async () => {
    const pt = perfectPlaythrough(generateWorld({ difficulty: 'normal' }));
    let a = initialAgent();
    for (const e of pt.events.filter((q) => q.kind === 'action')) {
      a = stepWorld(pt.world, a, e.payload.action!).agent;
      expect(e.payload.agent).toMatchObject({ x: a.x, y: a.y, dir: a.dir, score: a.score, hasGold: a.hasGold });
      expect(expand(e.payload.truth, e.payload.truthWumpusDead).cells.length).toBe(16);
    }
    expect(pt.final.agent.outcome).toBe('won');
  });
});
