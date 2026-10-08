import { vi } from 'vitest';
import { Engine, type EngineDeps, type Timings } from '../server/engine/engine.js';
import { rulesProvider, type AiProvider } from '../server/ai/provider.js';
import { localModerator, type Moderator } from '../server/core/moderation.js';
import type { ChatMessage, ScoreEvent } from '../shared/types.js';

export interface Harness {
  engine: Engine;
  awards: Map<string, ScoreEvent[]>;
  notices: Map<string, { kind: string; text: string }[]>;
  teacherId: string;
  onGroupMessage: ((sid: string, m: ChatMessage) => void)[];
}

export function makeHarness(opts: { ai?: AiProvider; moderator?: Moderator; timings?: Partial<Timings> } = {}): Harness {
  const awards = new Map<string, ScoreEvent[]>();
  const notices = new Map<string, { kind: string; text: string }[]>();
  const onGroupMessage: Harness['onGroupMessage'] = [];
  const deps: EngineDeps = {
    ai: opts.ai ?? rulesProvider,
    moderator: opts.moderator ?? localModerator,
    // Unit tests reply immediately; the simulation test opts into real pacing.
    timings: { minAiGapMs: 0, ...opts.timings },
    events: {
      sessionChanged() {},
      award(pid, ev) {
        awards.set(pid, [...(awards.get(pid) ?? []), ...ev]);
      },
      notice(pid, kind, text) {
        notices.set(pid, [...(notices.get(pid) ?? []), { kind, text }]);
      },
      groupMessage(sid, m) {
        onGroupMessage.forEach((f) => f(sid, m));
      },
    },
  };
  const engine = new Engine(deps);
  const teacherId = engine.loginTeacher('teacher@school.ca').id;
  return { engine, awards, notices, teacherId, onGroupMessage };
}

/** Create a session, join students, begin. Returns participant ids in join order. */
export function startSession(h: Harness, nicknames: string[], opts: { packId?: string; groupSize?: number; durationMin?: number; showIndividualRankings?: boolean } = {}) {
  const s = h.engine.createSession(h.teacherId, {
    packId: opts.packId ?? 'g8-fluids-floating',
    groupSize: opts.groupSize ?? 3,
    durationMin: opts.durationMin ?? 20,
    showIndividualRankings: opts.showIndividualRankings,
  });
  const ids = nicknames.map((n) => {
    const r = h.engine.join(s.code, n);
    if (!r.ok) throw new Error(r.error);
    return r.participantId;
  });
  h.engine.begin(s.id);
  return { session: s, ids };
}

export async function say(h: Harness, pid: string, text: string, settleMs = 1100) {
  await h.engine.studentSend(pid, text);
  await vi.advanceTimersByTimeAsync(settleMs);
}

export function groupMessages(h: Harness, pid: string) {
  return h.engine.groupOf(pid)!.messages;
}

export function aiMessages(h: Harness, pid: string) {
  return groupMessages(h, pid).filter((m) => m.sender === 'ai');
}

export function lastAi(h: Harness, pid: string) {
  const a = aiMessages(h, pid);
  return a[a.length - 1];
}

/** Advance fake time while running the engine's ticker. */
export async function runFor(h: Harness, ms: number) {
  const step = h.engine.t.tickMs;
  for (let t = 0; t < ms; t += step) {
    await vi.advanceTimersByTimeAsync(step);
    h.engine.tick();
  }
}
