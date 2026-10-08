import { Engine } from './engine/engine.js';
import { localModerator } from './core/moderation.js';
import { RateLimiter } from './core/joinCode.js';
import { rulesProvider, type AiProvider } from './ai/provider.js';
import { PACKS, summarizePack } from './packs/index.js';
import { SimDirector, type Persona } from './sim/simStudents.js';
import { buildReportCsv } from './engine/report.js';

/**
 * Transport-neutral request/event hub. The Node server wires it to Socket.IO; the browser demo
 * wires it to a SharedWorker so every tab on one computer shares the same live session.
 */
export interface Transport {
  /** Send an event to every client in a room. */
  emit(room: string, event: string, data?: unknown): void;
  /** Whether anyone is listening in a room (skip building snapshots otherwise). */
  hasListeners(room: string): boolean;
  join(clientId: string, room: string): void;
}

export interface Hub {
  engine: Engine;
  request(clientId: string, clientAddr: string, event: string, payload: any): Promise<{ ok: true; [k: string]: unknown } | { ok: false; error: string }>;
  disconnect(clientId: string): void;
}

export function createHub(transport: Transport, opts: { ai?: AiProvider } = {}): Hub {
  const pendingPush = new Map<string, ReturnType<typeof setTimeout>>();
  const participantOf = new Map<string, string>(); // clientId -> participantId
  const clientsOf = new Map<string, Set<string>>(); // participantId -> clientIds
  let sims: SimDirector | undefined;

  const engine = new Engine({
    ai: opts.ai ?? rulesProvider,
    moderator: localModerator,
    events: {
      sessionChanged(sessionId) {
        if (pendingPush.has(sessionId)) return;
        pendingPush.set(
          sessionId,
          setTimeout(() => {
            pendingPush.delete(sessionId);
            pushSnapshots(sessionId);
          }, 120),
        );
      },
      award: (pid, events) => transport.emit(`p:${pid}`, 'student:award', events),
      notice: (pid, kind, text) => transport.emit(`p:${pid}`, 'student:notice', { kind, text }),
      removed: (pid) => transport.emit(`p:${pid}`, 'student:removed'),
      groupMessage: (sessionId, msg) => sims?.onGroupMessage(sessionId, msg),
    },
  });
  sims = new SimDirector(engine);

  function pushSnapshots(sessionId: string) {
    const s = engine.sessions.get(sessionId);
    if (!s) return;
    if (transport.hasListeners(`teacher:${sessionId}`)) transport.emit(`teacher:${sessionId}`, 'teacher:state', engine.teacherState(sessionId));
    for (const p of s.participants.values()) {
      if (transport.hasListeners(`p:${p.id}`)) transport.emit(`p:${p.id}`, 'student:state', engine.studentState(p.id));
    }
  }

  const joinLimiter = new RateLimiter(10, 60_000); // NFR-009

  const teacherFor = (payload: { token?: string; sessionId?: string }) => {
    const t = payload.token ? engine.teacherFromToken(payload.token) : undefined;
    if (!t) throw new Error('Please sign in again.');
    if (payload.sessionId && !engine.ownsSession(t.id, payload.sessionId)) throw new Error('Not your session.');
    return t;
  };

  const bindParticipant = (clientId: string, pid: string) => {
    participantOf.set(clientId, pid);
    const set = clientsOf.get(pid) ?? new Set();
    set.add(clientId);
    clientsOf.set(pid, set);
    transport.join(clientId, `p:${pid}`);
  };

  const handlers: Record<string, (p: any, clientId: string, addr: string) => unknown> = {
    'teacher:login': ({ email }) => {
      const t = engine.loginTeacher(String(email ?? ''));
      return { token: t.token, email: t.email };
    },
    'teacher:packs': () => ({ packs: PACKS.map(summarizePack), aiProvider: engine.aiName }),
    'teacher:sessions': (p) => ({ sessions: engine.sessionsForTeacher(teacherFor(p).id) }),
    'teacher:create': (p) => {
      const t = teacherFor(p);
      const s = engine.createSession(t.id, { packId: p.packId, groupSize: Number(p.groupSize), durationMin: Number(p.durationMin), showIndividualRankings: !!p.showIndividualRankings });
      return { sessionId: s.id, code: s.code };
    },
    'teacher:watch': (p, clientId) => {
      teacherFor(p);
      transport.join(clientId, `teacher:${p.sessionId}`);
      return { state: engine.teacherState(p.sessionId) };
    },
    'teacher:begin': (p) => (teacherFor(p), engine.begin(p.sessionId)),
    'teacher:end': (p) => (teacherFor(p), engine.endSession(p.sessionId), {}),
    'teacher:pause': (p) => (teacherFor(p), engine.setPaused(p.sessionId, p.groupId, !!p.paused), {}),
    'teacher:message': (p) => (teacherFor(p), p.groupId ? engine.teacherMessage(p.sessionId, p.groupId, String(p.text ?? '')) : engine.broadcast(p.sessionId, String(p.text ?? '')), {}),
    'teacher:lock': (p) => (teacherFor(p), engine.setLocked(p.sessionId, !!p.locked), {}),
    'teacher:remove': (p) => (teacherFor(p), engine.removeParticipant(p.sessionId, p.participantId), {}),
    'teacher:adjust': (p) => {
      const t = teacherFor(p);
      engine.adjustScore(p.sessionId, p.eventId, Number(p.points), String(p.reason ?? ''), t.email);
      return {};
    },
    'teacher:ack': (p) => (teacherFor(p), engine.acknowledgeAlert(p.sessionId, p.alertId), {}),
    'teacher:delete': (p) => (teacherFor(p), engine.deleteSession(p.sessionId), {}),
    'teacher:report': (p) => (teacherFor(p), { csv: buildReportCsv(engine.teacherState(p.sessionId)) }),
    'teacher:audit': (p) => (teacherFor(p), { audit: engine.auditLog(p.sessionId) }),
    'teacher:addSims': (p) => {
      teacherFor(p);
      const s = engine.sessions.get(p.sessionId);
      if (!s) throw new Error('Session not found.');
      const allowed: Persona[] = ['eager', 'quiet', 'dominant', 'confused', 'builder'];
      const personas = Array.isArray(p.personas) ? (p.personas as unknown[]).filter((x): x is Persona => allowed.includes(x as Persona)) : undefined;
      const added = sims!.add(s.code, Math.max(1, Math.min(12, Number(p.count) || 5)), personas);
      return { added: added.length };
    },
    'student:join': ({ code, nickname }, clientId, addr) => {
      if (!joinLimiter.allow(addr)) throw new Error('Too many tries. Wait a minute and try again.');
      const r = engine.join(String(code ?? ''), String(nickname ?? ''));
      if (!r.ok) throw new Error(r.error);
      bindParticipant(clientId, r.participantId);
      return { token: r.token, state: engine.studentState(r.participantId) };
    },
    'student:resume': ({ token }, clientId) => {
      const p = engine.resume(String(token ?? ''));
      if (!p) throw new Error('expired');
      bindParticipant(clientId, p.id);
      return { state: engine.studentState(p.id) };
    },
    'student:send': async ({ text }, clientId) => {
      const pid = participantOf.get(clientId);
      if (!pid) throw new Error('Please join again.');
      const r = await engine.studentSend(pid, String(text ?? ''));
      if (!r.ok) throw new Error(r.error);
      return {};
    },
  };

  return {
    engine,
    async request(clientId, addr, event, payload) {
      const h = handlers[event];
      if (!h) return { ok: false, error: `Unknown request: ${event}` };
      try {
        return { ok: true, ...((await h(payload ?? {}, clientId, addr)) as object) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
      }
    },
    disconnect(clientId) {
      const pid = participantOf.get(clientId);
      participantOf.delete(clientId);
      if (!pid) return;
      const set = clientsOf.get(pid);
      set?.delete(clientId);
      if (!set || set.size === 0) engine.disconnect(pid);
    },
  };
}
