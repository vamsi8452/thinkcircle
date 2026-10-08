import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiMessages, lastAi, makeHarness, runFor, say, startSession } from './helpers.js';
import { checkAiMessage, composeRules, leaksAnswer } from '../server/core/compose.js';
import { PACKS } from '../server/packs/index.js';
import { fluids } from '../server/packs/fluids.js';
import type { AiProvider } from '../server/ai/provider.js';
import type { Decision } from '../server/core/facilitator.js';
import { STAGES } from '../shared/types.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('US-2 Socratic group dialogue', () => {
  it('Hook: the opening question comes from the concept pack', () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    expect(lastAi(h, ids[0]).text).toContain(fluids.stages.hook.questions[0]);
  });

  it("replies to a student's answer are questions and never state the answer", async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[0], 'I think the ship floats because it is big');
    const reply = lastAi(h, ids[0]);
    expect(['probe', 'connect', 'invite', 'challenge', 'advance']).toContain(reply.move);
    expect(reply.text).toContain('?');
    expect(leaksAnswer(reply.text, fluids)).toBe(false);
  });

  it('"just tell me the answer" gets a smaller hint phrased as a question (FR-014)', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await say(h, ids[1], 'just tell me the answer');
    const r = lastAi(h, ids[1]);
    expect(r.move).toBe('hint');
    expect(r.targetId).toBe(ids[1]);
    expect(r.text).toContain('?');
    expect(leaksAnswer(r.text, fluids)).toBe(false);
    // A second request gets the next, smaller step — still a question.
    await say(h, ids[1], 'can you just tell us the answer');
    const r2 = lastAi(h, ids[1]);
    expect(r2.text).not.toBe(r.text);
    expect(r2.text).toContain('?');
  });

  it('FR-013: advances when at least 60% of the group shows understanding', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    const g = h.engine.groupOf(ids[0])!;
    await say(h, ids[0], 'I think the ship floats because it is so big');
    expect(g.stage).toBe('hook');
    await say(h, ids[1], 'maybe the nail is pointy so it sinks into the water');
    // 2/3 understood, but the stage needs its minimum dwell time first.
    expect(g.stage).toBe('hook');
    await runFor(h, 0.3 * 0.15 * 20 * 60_000);
    expect(g.stage).toBe('probe');
    expect(aiMessages(h, ids[0]).some((m) => m.move === 'advance')).toBe(true);
  });

  it('FR-013: advances after the stage time limit even without understanding', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3'], { durationMin: 20 });
    const g = h.engine.groupOf(ids[0])!;
    await runFor(h, 0.15 * 20 * 60_000 + 6000);
    expect(g.stage).not.toBe('hook');
  });

  it('Consolidate: when each student explains in their own words, the group ends with a summary', async () => {
    const h = makeHarness();
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    const g = h.engine.groupOf(ids[0])!;
    g.stage = 'consolidate';
    g.stageStartedAt -= 10 * 60_000;
    const lines = fluids.simLines.consolidate;
    for (let i = 0; i < 3; i++) await say(h, ids[i], lines[i]);
    expect(g.status).toBe('complete');
    const summary = lastAi(h, ids[0]);
    expect(summary.move).toBe('summary');
    expect(summary.text).toMatch(/figured out/);
  });

  it('FR-012: a model that states the answer is rejected and replaced', async () => {
    const leaky: AiProvider = {
      name: 'leaky-test-model',
      usdPerMTokIn: 0,
      usdPerMTokOut: 0,
      async generate() {
        return { text: "The ship floats because its average density is less than the water's. Does that make sense?" };
      },
    };
    const h = makeHarness({ ai: leaky });
    const { ids } = startSession(h, ['A1', 'B2', 'C3']);
    await vi.advanceTimersByTimeAsync(10);
    await say(h, ids[0], 'why does the ship float though?');
    for (const m of aiMessages(h, ids[0])) expect(leaksAnswer(m.text, fluids)).toBe(false);
    expect(h.engine.auditLog(h.engine.groupOf(ids[0])!.sessionId).some((a) => /Guard rejected/.test(a.reason))).toBe(true);
  });

  it('edge case: AI model slow → fallback question within 10 seconds, teacher told if it persists', async () => {
    const hang: AiProvider = { name: 'hanging-model', usdPerMTokIn: 0, usdPerMTokOut: 0, generate: () => new Promise(() => {}) };
    const h = makeHarness({ ai: hang });
    const { session, ids } = startSession(h, ['A1', 'B2', 'C3']);
    await vi.advanceTimersByTimeAsync(10_100);
    expect(aiMessages(h, ids[0]).length).toBe(1);
    for (let i = 0; i < 2; i++) {
      await h.engine.studentSend(ids[i], 'I think the ship floats because it is big and wide');
      await vi.advanceTimersByTimeAsync(11_200);
    }
    expect(aiMessages(h, ids[0]).length).toBe(3);
    expect(h.engine.teacherState(session.id).alerts.some((a) => a.kind === 'ai-unavailable')).toBe(true);
  });

  it('every rules-composed move for every pack and stage passes the guard', () => {
    const moves: Decision['move'][] = ['open', 'probe', 'connect', 'hint', 'invite', 'challenge', 'support', 'redirect', 'language', 'own-words', 'advance', 'regroup', 'fallback', 'distress'];
    for (const pack of PACKS) {
      for (const stage of STAGES) {
        for (let turn = 0; turn < 6; turn++) {
          for (const move of moves) {
            for (const style of [undefined, 'analogy', 'peer-explain', 'harder', 'help-peer', 'misconception'] as Decision['style'][]) {
              const d: Decision = { move, style, targetId: 'a', peerId: 'b', refText: 'it floats because it is big', misconceptionId: pack.misconceptions[0].id, reason: 'test' };
              const text = composeRules(d, { pack, stage, nick: (id) => (id === 'a' ? 'BlueFox' : 'Comet'), allNicks: ['BlueFox', 'Comet'], hintLevel: turn % 4, turn });
              const g = checkAiMessage(text, pack, move);
              expect(g.problems, `${pack.id}/${stage}/${move}/${style}: ${text}`).toEqual([]);
            }
          }
        }
      }
    }
  });

  it('leak detector catches the target answer for each pack', () => {
    for (const pack of PACKS) {
      expect(leaksAnswer(pack.targetAnswer, pack)).toBe(true);
    }
    expect(leaksAnswer('Could it be that the ship has a lower density than water?', fluids)).toBe(true);
    expect(leaksAnswer("What's inside a ship that isn't inside a nail?", fluids)).toBe(false);
  });
});
