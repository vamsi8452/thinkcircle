import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeHarness, runFor, startSession } from './helpers.js';
import { CODE_ALPHABET, RateLimiter } from '../server/core/joinCode.js';
import { splitIntoGroups, pickGroupForLateJoiner } from '../server/core/grouping.js';
import { validateNickname } from '../server/core/nickname.js';
import { fluids } from '../server/packs/fluids.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('US-1 Start a session and join a group', () => {
  it('independent test: 6 students join and each lands in a group of 3–6', () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['BlueFox', 'Comet', 'Zippy', 'Mango', 'Pixel', 'Rocket'], { groupSize: 3 });
    const st = h.engine.teacherState(session.id);
    expect(st.groups.length).toBe(2);
    for (const g of st.groups) {
      expect(g.members.length).toBeGreaterThanOrEqual(3);
      expect(g.members.length).toBeLessThanOrEqual(6);
    }
    expect(new Set(ids.map((id) => h.engine.groupOf(id)!.id)).size).toBe(2);
  });

  it('FR-002/003: Start shows a 6-character join code and clamps settings', () => {
    const h = makeHarness();
    const s = h.engine.createSession(h.teacherId, { packId: fluids.id, groupSize: 9, durationMin: 99 });
    expect(s.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`));
    expect(s.groupSize).toBe(6);
    expect(s.durationMs).toBe(40 * 60_000);
    const d = h.engine.createSession(h.teacherId, { packId: fluids.id, groupSize: 4, durationMin: 0 });
    expect(d.durationMs).toBe(20 * 60_000);
  });

  it('codes are unique across sessions', () => {
    const h = makeHarness();
    const codes = new Set(Array.from({ length: 200 }, () => h.engine.createSession(h.teacherId, { packId: fluids.id, groupSize: 4, durationMin: 20 }).code));
    expect(codes.size).toBe(200);
  });

  it('a student joins with only a code and nickname and lands in the waiting room', () => {
    const h = makeHarness();
    const s = h.engine.createSession(h.teacherId, { packId: fluids.id, groupSize: 4, durationMin: 20 });
    const r = h.engine.join(s.code.toLowerCase(), 'BlueFox');
    expect(r.ok).toBe(true);
    const st = h.engine.studentState((r as { participantId: string }).participantId)!;
    expect(st.sessionStatus).toBe('waiting');
    expect(Object.keys(st.me).sort()).toEqual(['id', 'left', 'nickname', 'points']);
  });

  it('Begin splits students into groups and the opening question appears in each group', () => {
    const h = makeHarness();
    const { session } = startSession(h, ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8'], { groupSize: 4 });
    const st = h.engine.teacherState(session.id);
    expect(st.groups.map((g) => g.members.length)).toEqual([4, 4]);
    for (const g of st.groups) {
      const open = g.messages.find((m) => m.sender === 'ai');
      expect(open?.move).toBe('open');
      expect(open?.text).toContain(fluids.stages.hook.questions[0]);
    }
  });

  it('a duplicate nickname (any case) is rejected with a request to pick another', () => {
    const h = makeHarness();
    const s = h.engine.createSession(h.teacherId, { packId: fluids.id, groupSize: 4, durationMin: 20 });
    expect(h.engine.join(s.code, 'BlueFox').ok).toBe(true);
    const r = h.engine.join(s.code, 'bluefox');
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/pick another/i);
  });

  it('FR-004/005: nickname length, full names and unsafe nicknames are blocked', () => {
    expect(validateNickname('A', []).ok).toBe(false);
    expect(validateNickname('x'.repeat(21), []).ok).toBe(false);
    expect(validateNickname('Maya Singh', []).ok).toBe(false);
    expect(validateNickname('john smith', []).ok).toBe(false);
    expect(validateNickname('Blue Fox', []).ok).toBe(true);
    expect(validateNickname('sh1tlord', []).ok).toBe(false);
    expect(validateNickname('Loser', []).ok).toBe(false);
    expect(validateNickname('CoolCat_7', []).ok).toBe(true);
  });

  it('FR-006: late joiners go to the smallest group', () => {
    const h = makeHarness();
    const { session } = startSession(h, ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'], { groupSize: 4 });
    const before = h.engine.teacherState(session.id).groups.map((g) => g.members.length);
    expect(before).toEqual([4, 3]);
    const r = h.engine.join(session.code, 'Late1');
    expect(r.ok).toBe(true);
    const g = h.engine.groupOf((r as { participantId: string }).participantId)!;
    expect(g.id).toBe(h.engine.teacherState(session.id).groups[1].id);
    expect(pickGroupForLateJoiner([6, 6])).toBe(-1);
  });

  it('balanced split never exceeds 6, never leaves one alone, and differs by at most 1', () => {
    for (let n = 1; n <= 40; n++) {
      for (let size = 3; size <= 6; size++) {
        const { groups } = splitIntoGroups(Array.from({ length: n }, (_, i) => i), size);
        const sizes = groups.map((g) => g.length);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...sizes)).toBeLessThanOrEqual(6);
        if (n > 1) expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('edge case: only 1–2 students → teacher warned, group of 2 allowed', () => {
    const h = makeHarness();
    const { session } = startSession(h, ['A1', 'B2'], { groupSize: 4 });
    const st = h.engine.teacherState(session.id);
    expect(st.groups.length).toBe(1);
    expect(st.groups[0].members.length).toBe(2);
    expect(st.alerts.some((a) => a.kind === 'small-class')).toBe(true);
  });

  it('FR-007: 2-minute warning, then all groups end when the duration expires', async () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['A1', 'B2', 'C3'], { durationMin: 10 });
    await runFor(h, 8 * 60_000 + 5000);
    const g = h.engine.groupOf(ids[0])!;
    expect(g.messages.some((m) => m.sender === 'system' && /2 minutes left/.test(m.text))).toBe(true);
    expect(h.engine.teacherState(session.id).status).toBe('running');
    await runFor(h, 2 * 60_000);
    const st = h.engine.teacherState(session.id);
    expect(st.status).toBe('ended');
    expect(st.scoreboard).toBeDefined();
    expect((await h.engine.studentSend(ids[0], 'hello')).ok).toBe(false);
    expect(h.engine.join(session.code, 'NewKid').ok).toBe(false); // code invalid after end
  });

  it('teacher can lock the session to new joins and remove a participant', () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['A1', 'B2', 'C3']);
    h.engine.setLocked(session.id, true);
    expect(h.engine.join(session.code, 'Outsider').ok).toBe(false);
    h.engine.removeParticipant(session.id, ids[2]);
    expect(h.engine.activeMembers(h.engine.groupOf(ids[0])!).length).toBe(2);
  });

  it('NFR-009: join attempts are rate-limited', () => {
    const rl = new RateLimiter(10, 60_000);
    const results = Array.from({ length: 12 }, () => rl.allow('1.2.3.4', 1000));
    expect(results.filter(Boolean).length).toBe(10);
    expect(rl.allow('1.2.3.4', 1000 + 61_000)).toBe(true);
  });

  it('NFR-004: a student who reconnects within 2 minutes keeps group and points', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await h.engine.studentSend(ids[0], 'I think it floats because the ship is full of air');
    const pts = h.engine.studentState(ids[0])!.me.points;
    const token = h.engine.participant(ids[0])!.token;
    h.engine.disconnect(ids[0]);
    await runFor(h, 90_000);
    const p = h.engine.resume(token)!;
    expect(p.id).toBe(ids[0]);
    const st = h.engine.studentState(ids[0])!;
    expect(st.me.points).toBe(pts);
    expect(st.me.left).toBe(false);
    expect(st.messages.length).toBeGreaterThan(1);
  });

  it('edge case: a student who leaves keeps their points, marked left early', async () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['A1', 'B2', 'C3']);
    await h.engine.studentSend(ids[0], 'I think it floats because the ship is full of air');
    h.engine.disconnect(ids[0]);
    await runFor(h, 130_000);
    h.engine.endSession(session.id);
    const m = h.engine.teacherState(session.id).scoreboard!.teams[0].members.find((x) => x.id === ids[0])!;
    expect(m.left).toBe(true);
    expect(m.points).toBeGreaterThan(0);
  });
});
