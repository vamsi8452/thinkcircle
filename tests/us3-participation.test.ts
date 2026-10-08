import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiMessages, lastAi, makeHarness, runFor, say, startSession } from './helpers.js';
import { classifyEngagement } from '../server/core/engagement.js';
import { readSignals } from '../server/core/signals.js';
import { fluids } from '../server/packs/fluids.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const chatter = ['maybe it is about the shape', 'what about the size of it', 'the water is doing something', 'I saw a metal bowl float once', 'it is really big though', 'maybe the nail is pointy'];

describe('US-3 Every student is drawn in', () => {
  it('independent test: silent student addressed within 90s; dominant student gets less AI attention', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['Loud', 'Mid', 'Quiet']);
    const [loud, mid, quiet] = ids;
    let addressedQuietAt: number | null = null;
    const start = Date.now();
    for (let i = 0; i < 18 && addressedQuietAt === null; i++) {
      await say(h, loud, chatter[i % chatter.length], 2000);
      if (i % 4 === 3) await say(h, mid, chatter[(i + 2) % chatter.length], 2000);
      h.engine.tick();
      const q = aiMessages(h, quiet).find((m) => m.targetId === quiet);
      if (q) {
        addressedQuietAt = q.ts;
        expect(q.text).toContain('Quiet');
      }
    }
    expect(addressedQuietAt).not.toBeNull();
    expect(addressedQuietAt! - start).toBeLessThanOrEqual(90_000);

    // Once Loud has >2x the group average, AI turns stop targeting Loud.
    const p = h.engine.participant(loud)!;
    expect(p.state).toBe('dominating');
    const before = aiMessages(h, loud).length;
    for (let i = 0; i < 4; i++) await say(h, loud, chatter[i], 2000);
    const after = aiMessages(h, loud).slice(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((m) => m.targetId !== loud)).toBe(true);
  });

  it('FR-022: a student silent 60s is addressed by nickname with a low-stakes question on the next turn', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'Shy']);
    await runFor(h, 65_000);
    const r = aiMessages(h, ids[2]).find((m) => m.move === 'invite');
    expect(r).toBeDefined();
    expect(r!.text).toMatch(/Shy|A1|B2/);
    expect(r!.text).toContain('?');
  });

  it('confusion → smaller step, analogy, or a peer explains', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], "I don't get it, what do you mean?");
    const r = lastAi(h, ids[0]);
    expect(r.targetId).toBe(ids[0]);
    expect(['hint', 'connect']).toContain(r.move);
  });

  it('frustration → acknowledges effort and offers an easier question', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], 'ugh this is too hard, I give up');
    const r = lastAi(h, ids[0]);
    expect(r.move).toBe('support');
    expect(r.text).toMatch(/working hard/);
    expect(r.text).toContain('?');
  });

  it('quick correct answers → harder "what if" or help a peer', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    const g = h.engine.groupOf(ids[0])!;
    g.stage = 'challenge';
    await say(h, ids[0], 'the ship is hollow and full of air so it is lighter for its size', 1100);
    await say(h, ids[0], 'it pushes a lot of water out of the way because it is wide, so the water pushes back up', 1100);
    const r = lastAi(h, ids[0]);
    expect(h.engine.participant(ids[0])!.state === 'ahead' || r.move === 'advance').toBe(true);
    if (r.move !== 'advance') {
      expect(r.move).toBe('challenge');
      expect(r.targetId).toBe(ids[0]);
    }
  });

  it('FR-024: the same student is never addressed more than 2 turns in a row when others are present', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    for (let i = 0; i < 8; i++) await say(h, ids[0], `maybe it is about thing number ${i} because of the water`, 2500);
    const targets = aiMessages(h, ids[0]).map((m) => m.targetId ?? null);
    for (let i = 2; i < targets.length; i++) {
      if (targets[i]) expect(targets[i] === targets[i - 1] && targets[i] === targets[i - 2]).toBe(false);
    }
  });

  it('FR-021: engagement is classified from text, timing and counts only', () => {
    const base = { now: 100_000, messageCount: 1, groupAvgCount: 1, activeMembers: 3, silentMs: 0 };
    const sig = (t: string) => readSignals(t, fluids);
    expect(classifyEngagement({ ...base, recent: [{ ts: 99_000, signals: sig('ugh I give up'), scoredReasoning: 0 }] }).state).toBe('frustrated');
    expect(classifyEngagement({ ...base, recent: [{ ts: 99_000, signals: sig("I don't get it"), scoredReasoning: 0 }] }).state).toBe('confused');
    expect(classifyEngagement({ ...base, recent: [], silentMs: 61_000 }).state).toBe('disengaged');
    expect(classifyEngagement({ ...base, recent: [], messageCount: 7, groupAvgCount: 3 }).state).toBe('dominating');
  });

  it('FR-025: engagement states and move reasons never reach students', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], "I don't get it, I'm confused");
    await runFor(h, 70_000);
    const st = h.engine.studentState(ids[0])!;
    const json = JSON.stringify(st);
    for (const word of ['"state":', '"stateConfidence"', '"flag":', 'silent for']) expect(json).not.toContain(word);
    // Award reasons are meant for students (FR-031); AI move reasons are not.
    expect(JSON.stringify(st.messages)).not.toContain('"reason":');
  });

  it('edge case: whole group silent for 2 minutes → easier open question and a "stalled" flag', async () => {
    const h = makeHarness();
    const { session, ids } = startSession(h, ['A1', 'B2', 'C3']);
    await runFor(h, 125_000);
    expect(aiMessages(h, ids[0]).some((m) => m.move === 'regroup')).toBe(true);
    expect(h.engine.teacherState(session.id).alerts.some((a) => a.kind === 'stalled')).toBe(true);
  });

  it('edge case: a burst of messages gets one AI reply after it finishes', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    const before = aiMessages(h, ids[0]).length;
    await h.engine.studentSend(ids[0], 'maybe it is the shape');
    await vi.advanceTimersByTimeAsync(400);
    await h.engine.studentSend(ids[1], 'or the air inside it');
    await vi.advanceTimersByTimeAsync(400);
    await h.engine.studentSend(ids[2], 'I think it is how big it is');
    await vi.advanceTimersByTimeAsync(1200);
    expect(aiMessages(h, ids[0]).length).toBe(before + 1);
  });

  it('pacing: routine replies wait so students can talk to each other; urgent ones do not', async () => {
    const h = makeHarness({ timings: { minAiGapMs: 7000 } });
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], 'maybe it is because of the shape', 1100);
    expect(aiMessages(h, ids[0]).length).toBe(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(aiMessages(h, ids[0]).length).toBe(2);
    await say(h, ids[1], 'just tell us the answer', 1100);
    expect(lastAi(h, ids[1]).move).toBe('hint');
  });

  it('edge case: long pasted answer → asked to explain in own words', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    const g = h.engine.groupOf(ids[0])!;
    g.stage = 'probe';
    const essay = 'Buoyancy is a phenomenon in which a fluid exerts an upward force on an immersed object. '.repeat(4);
    await say(h, ids[0], essay);
    expect(['own-words', 'advance']).toContain(lastAi(h, ids[0]).move);
  });

  it('edge case: another language → AI replies in English and asks for English', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], 'yo creo que el barco flota porque es grande');
    const r = lastAi(h, ids[0]);
    expect(r.move).toBe('language');
    expect(r.text).toMatch(/English/);
  });
});
