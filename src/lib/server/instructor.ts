import ExcelJS from 'exceljs';
import { DB, Row } from './db';
import { effectiveStatus, sessionPublic, Summary } from './service';
import { GameState, buildReport } from '@/lib/engine/game';
import { MISCONCEPTIONS } from '@/lib/engine/checkpoints';
import { InferenceRecord } from '@/lib/engine/reasoner';
import { engineKnowledge } from '@/lib/engine/game';
import { compact } from '@/lib/engine/reasoner';
import { randomUUID } from 'crypto';

export const CATEGORY_LABELS: Record<string, string> = {
  percept_understanding: 'Percept Understanding', safe_recognition: 'Safe Square Recognition', possible_pit: 'Possible Pit Identification',
  confirmed_pit: 'Confirmed Pit Identification', wumpus_identification: 'Wumpus Identification', knowledge_integration: 'Knowledge Integration',
};
const MCQ_OPTIONS: Record<string, { id: string; text: string; correct?: boolean }[]> = {
  meaning_breeze: [{ id: 'a', text: 'At least one adjacent Pit', correct: true }, { id: 'b', text: 'A Pit in the current square' }, { id: 'c', text: 'A Wumpus nearby' }],
  meaning_stench: [{ id: 'a', text: 'Wumpus in an adjacent square', correct: true }, { id: 'b', text: 'Wumpus in the current square' }, { id: 'c', text: 'A Pit nearby' }],
};

export function computeAnalytics(attempts: Row[]) {
  const categories: Record<string, { correct: number; total: number }> = {};
  for (const k of Object.keys(CATEGORY_LABELS)) categories[k] = { correct: 0, total: 0 };
  const misc: Record<string, { count: number; students: Set<string> }> = {};
  const byKind: Record<string, { total: number; correct: number; options: Record<string, number>; misconceptions: Record<string, number> }> = {};
  for (const a of attempts) {
    const c = (categories[a.category] ??= { correct: 0, total: 0 }); c.total++; if (a.correct) c.correct++;
    const k = (byKind[a.kind] ??= { total: 0, correct: 0, options: {}, misconceptions: {} }); k.total++; if (a.correct) k.correct++;
    const opt = a.answer?.optionId; if (opt) k.options[opt] = (k.options[opt] ?? 0) + 1;
    for (const m of a.misconceptions ?? []) {
      (misc[m] ??= { count: 0, students: new Set() }).count++; misc[m].students.add(a.participant_id);
      k.misconceptions[m] = (k.misconceptions[m] ?? 0) + 1;
    }
  }
  return {
    categories: Object.entries(categories).map(([id, v]) => ({ id, label: CATEGORY_LABELS[id] ?? id, ...v, pct: v.total ? Math.round((v.correct / v.total) * 100) : null })),
    misconceptions: Object.entries(misc).map(([id, v]) => ({ id, en: MISCONCEPTIONS[id]?.en ?? id, ar: MISCONCEPTIONS[id]?.ar ?? id, count: v.count, students: v.students.size })).sort((a, b) => b.count - a.count),
    checkpoints: Object.entries(byKind).map(([kind, v]) => ({
      kind, total: v.total, correct: v.correct, pct: Math.round((v.correct / v.total) * 100),
      options: MCQ_OPTIONS[kind]?.map((o) => ({ ...o, count: v.options[o.id] ?? 0 })) ?? null,
      misconceptions: Object.entries(v.misconceptions).map(([id, count]) => ({ id, count, ar: MISCONCEPTIONS[id]?.ar ?? id, en: MISCONCEPTIONS[id]?.en ?? id })),
    })),
  };
}

/** If the session is over, mark any still-playing games as timeouts (so dashboard numbers are final). */
async function settleFinished(db: DB, s: Row) {
  if (effectiveStatus(s) !== 'finished') return;
  const games = (await db.list('game_instances', { session_id: s.id })).filter((g) => g.status === 'playing');
  for (const g of games) {
    const p = await db.get('participants', g.participant_id);
    if (!p) continue;
    const next: GameState = structuredClone(g.state); next.agent.outcome = 'timeout'; next.pending = []; next.seq += 1;
    next.reveal = { obsCount: next.obs.length, wumpusDead: !next.agent.wumpusAlive, recSeq: next.seq };
    await db.update('game_instances', g.id, { state: next, status: 'timeout', ended_at: new Date().toISOString(), version: g.version + 1 });
    const attempts = await db.list('inference_attempts', { game_id: g.id });
    await db.upsert('assessment_results', { game_id: g.id, session_id: s.id, participant_id: p.id, report: buildReport(next, attempts.map((a) => ({ category: a.category, correct: a.correct, misconceptions: a.misconceptions ?? [] }))) }, 'game_id');
    const st = next.stats; const sum: Summary = { ...p.summary };
    const agg = { ...sum.agg }; agg.cellsCorrect += st.cellsCorrect; agg.cellsRelevant += st.cellsRelevant; agg.risky += st.riskyDecisions; agg.safe += st.safeDecisions; agg.correct += st.correctInferences; agg.incorrect += st.incorrectInferences; agg.completed += 1; agg.gold += next.agent.hasGold ? 1 : 0;
    await db.update('participants', p.id, { summary: { ...sum, agg, status: 'timeout', outcome: 'timeout', completed: agg.completed, cellsCorrect: agg.cellsCorrect, cellsRelevant: agg.cellsRelevant, risky: agg.risky, safeMoves: agg.safe, correct: agg.correct, incorrect: agg.incorrect } });
    await db.insert('game_events', { id: randomUUID(), game_id: g.id, session_id: s.id, seq: next.seq, kind: 'end', payload: { kind: 'end', seq: next.seq, agent: { ...next.agent }, percepts: next.percepts, truth: compact(engineKnowledge(next)), truthWumpusDead: !next.agent.wumpusAlive, recordIds: [] } });
  }
}

export async function overview(db: DB, s0: Row) {
  await settleFinished(db, s0);
  const s = (await db.get('classroom_sessions', s0.id)) ?? s0;
  const now = Date.now();
  const [parts, attempts] = await Promise.all([db.list('participants', { session_id: s.id }), db.list('inference_attempts', { session_id: s.id })]);
  const rows = parts.map((p) => {
    const sm: Summary = p.summary ?? ({} as Summary);
    const lastSeenMs = now - new Date(p.last_seen).getTime();
    const accuracy = sm.cellsRelevant ? Math.round((sm.cellsCorrect / sm.cellsRelevant) * 100) : null;
    return { id: p.id, name: p.display_name, status: sm.status ?? 'waiting', x: sm.x ?? 1, y: sm.y ?? 1, progress: sm.progress ?? 0, accuracy, risky: sm.risky ?? 0, deaths: sm.deaths ?? 0, hasGold: !!sm.hasGold || (sm.goldFound ?? 0) > 0, score: sm.score ?? 0, correct: sm.correct ?? 0, incorrect: sm.incorrect ?? 0, mode: sm.mode ?? null, active: sm.status === 'playing' && lastSeenMs < 45_000, lastSeenSec: Math.round(lastSeenMs / 1000), gameId: sm.gameId ?? null, completed: (sm.completed ?? 0) > 0 };
  });
  const accs = rows.filter((r) => r.accuracy !== null).map((r) => r.accuracy as number);
  const metrics = {
    participants: rows.length, active: rows.filter((r) => r.active).length, completed: rows.filter((r) => r.completed).length,
    avgAccuracy: accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null,
    risky: rows.reduce((a, r) => a + r.risky, 0), deaths: rows.reduce((a, r) => a + r.deaths, 0), foundGold: rows.filter((r) => r.hasGold).length,
  };
  return { session: sessionPublic(s, now), metrics, students: rows, analytics: computeAnalytics(attempts) };
}

export async function studentDetail(db: DB, s: Row, pid: string, gameId?: string) {
  const p = await db.get('participants', pid);
  if (!p || p.session_id !== s.id) return null;
  const games = await db.list('game_instances', { participant_id: pid }, { order: 'started_at', desc: true });
  const g = gameId ? games.find((x) => x.id === gameId) : games[0];
  if (!g) return { participant: { id: p.id, name: p.display_name }, games: [], game: null };
  const [events, attempts, records, world] = await Promise.all([
    db.list('game_events', { game_id: g.id }, { order: 'seq' }), db.list('inference_attempts', { game_id: g.id }, { order: 'step' }),
    db.list('inference_records', { game_id: g.id }, { order: 'step' }), db.get('hidden_worlds', g.id),
  ]);
  const attemptIdx = new Map(attempts.map((a) => [a.id, a]));
  return {
    participant: { id: p.id, name: p.display_name },
    games: games.map((x) => ({ id: x.id, mode: x.mode, status: x.status, score: x.score, startedAt: x.started_at })),
    game: { id: g.id, mode: g.mode, status: g.status, score: g.score, stats: g.state.stats },
    world: world?.world ? { pits: world.world.pits, wumpus: world.world.wumpus, gold: world.world.gold, teaching: world.world.teaching } : null,
    events: events.map((e) => ({ seq: e.seq, kind: e.kind, payload: e.payload })), records: records.map((r) => r.record as InferenceRecord),
    attempts: attempts.map((a) => ({ id: a.id, kind: a.kind, category: a.category, step: a.step, correct: a.correct, misconceptions: a.misconceptions, answer: a.answer, evaluation: a.evaluation })),
    report: (await db.get('assessment_results', g.id))?.report ?? null, _idx: attemptIdx.size,
  };
}

export async function rulesSummary(db: DB, sessionId: string) {
  const recs = await db.list('inference_records', { session_id: sessionId });
  const m = new Map<string, number>();
  for (const r of recs) { const name = (r.record as InferenceRecord).ruleName; m.set(name, (m.get(name) ?? 0) + 1); }
  return [...m.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
}

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : /^[=+\-@]/.test(s) ? `'${s}` : s; };
export const toCSV = (rows: (string | number | boolean | null)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');

export async function exportTables(db: DB, s: Row) {
  const o = await overview(db, s);
  const attempts = await db.list('inference_attempts', { session_id: s.id });
  const nameOf = new Map(o.students.map((r) => [r.id, r.name]));
  const students = [['Student', 'Mode', 'Status', 'Current square', 'Progress %', 'Inference accuracy %', 'Correct inferences', 'Incorrect inferences', 'Risky actions', 'Deaths', 'Found gold', 'Game score'],
    ...o.students.map((r) => [r.name, r.mode, r.status, `[${r.x},${r.y}]`, r.progress, r.accuracy, r.correct, r.incorrect, r.risky, r.deaths, r.hasGold ? 'yes' : 'no', r.score])];
  const att = [['Student', 'Checkpoint', 'Category', 'Step', 'Correct', 'Cells correct', 'Cells judged', 'Misconceptions'],
    ...attempts.map((a) => [nameOf.get(a.participant_id) ?? '', a.kind, a.category, a.step, a.correct ? 'yes' : 'no', a.cells_correct, a.cells_relevant, (a.misconceptions ?? []).join('; ')])];
  const rules = [['Rule', 'Times applied'], ...(await rulesSummary(db, s.id)).map((r) => [r.rule, r.count])];
  const analytics = [['Skill', 'Correct', 'Attempts', '%'], ...o.analytics.categories.map((c) => [c.label, c.correct, c.total, c.pct]), [], ['Misconception', 'Count', 'Students'], ...o.analytics.misconceptions.map((m) => [m.en, m.count, m.students])];
  return { students, attempts: att, rules, analytics };
}
export async function exportXlsx(db: DB, s: Row): Promise<Buffer> {
  const t = await exportTables(db, s);
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(t)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r) => ws.addRow(r.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v))));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
