import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeHarness, say, startSession } from './helpers.js';
import { RUBRIC, applyStageCap, scoreMessage } from '../server/core/scoring.js';
import { readSignals } from '../server/core/signals.js';
import { fluids } from '../server/packs/fluids.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const score = (text: string, peers: string[] = ['Comet', 'Mango'], first = false, lastOther?: string) =>
  scoreMessage({ text, signals: readSignals(text, fluids), isFirstContribution: first, peers, lastOtherSpeaker: lastOther });

// A small labelled set (SC-004 will grow this to 200 teacher-scored messages).
const LABELLED: { text: string; expect: Partial<Record<string, number>> }[] = [
  { text: 'I agree with Comet because the ship has air inside so it is light for its size', expect: { 'build-on-peer': 0, 'explain-to-peer': 3 } },
  { text: 'building on what Mango said, the shape lets it push more water out of the way', expect: { 'build-on-peer': 2 } },
  { text: 'why does a beach ball float if it is the same size as a bowling ball?', expect: { 'good-question': 2 } },
  { text: 'I changed my mind, it is not the weight because the ship is heavier but it floats', expect: { 'changed-mind': 2 } },
  { text: 'Comet, it floats because the air inside makes it light for its size', expect: { 'explain-to-peer': 3 } },
  { text: 'lol', expect: { reasoning: 0 } },
  { text: 'I like pizza and video games a lot', expect: { reasoning: 0 } },
  { text: 'it floats because it is hollow and full of air, for example a beach ball', expect: { reasoning: 3 } },
];

describe('US-4 Points and scoreboard', () => {
  it('labelled sample messages score as a teacher would', () => {
    for (const l of LABELLED) {
      const awards = score(l.text);
      for (const [b, pts] of Object.entries(l.expect)) {
        const got = awards.find((a) => a.behaviour === b)?.points ?? 0;
        expect(got, `${b} for "${l.text}"`).toBe(pts);
      }
    }
  });

  it('building on a classmate gives +2 with a reason naming them', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['Comet', 'Mango', 'Zippy']);
    await say(h, ids[0], 'I think the ship floats because it is really wide');
    await say(h, ids[1], 'I agree with Comet, and also the shape spreads out on the water');
    const ev = h.awards.get(ids[1])!.find((e) => e.behaviour === 'build-on-peer')!;
    expect(ev.points).toBe(2);
    expect(ev.reason).toContain('Comet');
  });

  it('FR-032: two students sending the same correct answer seconds apart score the same', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['Comet', 'Mango', 'Zippy']);
    const ans = 'it floats because the ship is hollow and has air so it is light for its size';
    await h.engine.studentSend(ids[0], ans);
    await vi.advanceTimersByTimeAsync(2000);
    await h.engine.studentSend(ids[1], ans);
    await vi.advanceTimersByTimeAsync(1100);
    const sum = (id: string) => (h.awards.get(id) ?? []).filter((e) => e.participantId === id).reduce((a, e) => a + e.points, 0);
    expect(sum(ids[0])).toBe(sum(ids[1]));
  });

  it('FR-033: per-stage cap of 8; no more points, no penalty', () => {
    const big = [
      { behaviour: 'reasoning' as const, points: 3, reason: 'x' },
      { behaviour: 'explain-to-peer' as const, points: 3, reason: 'x' },
      { behaviour: 'good-question' as const, points: 2, reason: 'x' },
    ];
    expect(applyStageCap(big, 0).reduce((a, b) => a + b.points, 0)).toBe(8);
    expect(applyStageCap(big, 7).reduce((a, b) => a + b.points, 0)).toBe(1);
    expect(applyStageCap(big, 8)).toEqual([]);
  });

  it('cap applies in a live session and the student sees no penalty', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['Comet', 'Mango', 'Zippy']);
    const g = h.engine.groupOf(ids[0])!;
    g.stage = 'challenge';
    const good = 'Mango, it floats because the hollow ship is full of air, for example a beach ball is light for its size';
    for (let i = 0; i < 5; i++) await say(h, ids[0], good, 1200);
    const events = (h.awards.get(ids[0]) ?? []).filter((e) => e.participantId === ids[0] && e.stage === 'challenge');
    expect(events.reduce((a, e) => a + e.points, 0)).toBeLessThanOrEqual(RUBRIC.stageCap);
    expect(events.every((e) => e.points > 0)).toBe(true);
  });

  it('FR-034: all-voices +5 team bonus once everyone has contributed', async () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['Comet', 'Mango', 'Zippy']);
    for (const id of ids.slice(0, 2)) await say(h, id, 'maybe it is because of the shape');
    expect(h.engine.teacherState(session.id).groups[0].teamBonusAwarded).toBe(false);
    await say(h, ids[2], 'I think it is the air');
    const g = h.engine.teacherState(session.id).groups[0];
    expect(g.teamBonusAwarded).toBe(true);
    expect(h.engine.teacherState(session.id).scoreEvents.filter((e) => e.behaviour === 'team-bonus')).toHaveLength(1);
  });

  it('FR-031: every award reason is 12 words or fewer', () => {
    for (const l of LABELLED) for (const a of score(l.text, ['SuperLongNicknameHere'], true, 'SomeoneElse')) expect(a.reason.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it('first contribution earns +1', () => {
    expect(score('hi', [], true).find((a) => a.behaviour === 'first-contribution')?.points).toBe(1);
  });

  it('FR-035/036: scoreboard has team ranking, a badge per student, group summary; individual ranks only if enabled', async () => {
    for (const enabled of [false, true]) {
      const h = makeHarness();
      const { session, ids } = startSession(h, ['A1', 'B2', 'C3', 'D4', 'E5', 'F6'], { showIndividualRankings: enabled });
      await say(h, ids[0], 'it floats because the ship is hollow and full of air');
      await say(h, ids[1], 'maybe it is because of the shape');
      h.engine.endSession(session.id);
      const sb = h.engine.teacherState(session.id).scoreboard!;
      expect(sb.teams.length).toBe(2);
      expect(sb.teams[0].rank).toBe(1);
      expect(sb.teams[0].teamScore).toBeGreaterThanOrEqual(sb.teams[1].teamScore);
      for (const t of sb.teams) {
        expect(t.summary.length).toBeGreaterThan(10);
        for (const m of t.members) expect(m.badge).toBeTruthy();
      }
      expect(!!sb.individual).toBe(enabled);
      expect(!!h.engine.studentState(ids[0])!.scoreboard?.individual).toBe(enabled);
    }
  });

  it('FR-052: teacher can change a score; scoreboard updates and the change is logged', async () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], 'it floats because the ship is hollow and full of air');
    const ev = h.engine.teacherState(session.id).scoreEvents[0];
    const before = h.engine.studentState(ids[0])!.me.points;
    h.engine.adjustScore(session.id, ev.id, ev.points + 2, 'Great example', 'teacher@school.ca');
    expect(h.engine.studentState(ids[0])!.me.points).toBe(before + 2);
    expect(h.engine.auditLog(session.id).some((a) => a.type === 'override' && /Great example/.test(a.reason))).toBe(true);
  });

  it('NFR-014: every score is logged with inputs, output, reason and rubric version', async () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], 'it floats because the ship is hollow and full of air');
    const logs = h.engine.auditLog(session.id).filter((a) => a.type === 'score');
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l.inputs).toBeTruthy();
      expect(l.output).toBeTruthy();
      expect(l.reason).toBeTruthy();
      expect(l.rubricVersion).toMatch(/rubric/);
    }
  });
});
