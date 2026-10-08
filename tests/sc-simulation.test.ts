import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeHarness, runFor } from './helpers.js';
import { SimDirector } from '../server/sim/simStudents.js';
import { leaksAnswer } from '../server/core/compose.js';
import { moderateText } from '../server/core/moderation.js';
import { PACKS } from '../server/packs/index.js';
import { STAGES } from '../shared/types.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('Simulated sessions (SC-002, SC-003, US-2 independent test)', () => {
  it('20 simulated sessions: AI never states the answer, everyone addressed every 3 minutes, all 5 stages reached', async () => {
    let stagesCompleteGroups = 0;
    let totalGroups = 0;
    for (let run = 0; run < 20; run++) {
      const pack = PACKS[run % PACKS.length];
      const h = makeHarness({ timings: { minAiGapMs: 7000 } });
      const sims = new SimDirector(h.engine, { random: seeded(run + 1) });
      h.onGroupMessage.push((sid, m) => sims.onGroupMessage(sid, m));
      const s = h.engine.createSession(h.teacherId, { packId: pack.id, groupSize: 5, durationMin: 20 });
      sims.add(s.code, 5, ['eager', 'quiet', 'dominant', 'confused', 'builder']);
      h.engine.begin(s.id);
      await runFor(h, 20 * 60_000 + 10_000);
      const st = h.engine.teacherState(s.id);
      expect(st.status).toBe('ended');
      // Full transcripts from the engine (teacher snapshots only carry the latest 200 messages).
      for (const g of h.engine.sessions.get(s.id)!.groups.map((x) => ({ ...x, members: st.groups.find((y) => y.id === x.id)!.members }))) {
        totalGroups++;
        const ai = g.messages.filter((m) => m.sender === 'ai');
        // SC-002
        for (const m of ai) {
          expect(leaksAnswer(m.text, pack) && m.move !== 'summary', `${pack.id}: ${m.text}`).toBe(false);
          expect(moderateText(m.text).action).toBe('allow');
        }
        // US-2: the transcript moves through all 5 stages
        const stageLogs = h.engine.auditLog(s.id).filter((a) => a.type === 'stage' && a.groupId === g.id).map((a) => a.output);
        if (STAGES.slice(1).every((st2) => stageLogs.includes(st2))) stagesCompleteGroups++;
        // SC-003: every student addressed at least once every 3 minutes while the group is active
        const groupStart = st.startedAt!;
        // Measured while the discussion is live: until the group's summary (or the session end).
        const groupEnd = Math.max(...ai.map((m) => m.ts));
        for (const mem of g.members) {
          const times = [groupStart, ...ai.filter((m) => m.targetId === mem.id || m.move === 'open').map((m) => m.ts), groupEnd].sort((a, b) => a - b);
          for (let i = 1; i < times.length; i++) {
            expect(times[i] - times[i - 1], `${mem.nickname} in ${pack.id} run ${run}`).toBeLessThanOrEqual(180_000);
          }
        }
      }
      sims.clear();
    }
    expect(stagesCompleteGroups).toBe(totalGroups);
  }, 60_000);
});
