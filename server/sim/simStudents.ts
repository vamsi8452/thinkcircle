import type { ChatMessage, Stage } from '../../shared/types.js';
import type { Engine } from '../engine/engine.js';

// Simulated students for the investor demo and for SC-002/SC-003 transcript tests.
// They are clearly marked as simulated in the teacher view.

export type Persona = 'eager' | 'quiet' | 'dominant' | 'confused' | 'builder';
const PERSONA_CYCLE: Persona[] = ['eager', 'quiet', 'dominant', 'confused', 'builder', 'eager'];
const NAMES = ['BlueFox', 'NovaKid', 'PixelPanda', 'QuietOwl', 'RocketRay', 'MapleMoose', 'ZipZap', 'LunaLynx', 'CometCat', 'TurboTurtle', 'MangoMoth', 'Sparky'];

const CONFUSED = ["I don't get it, what do you mean?", "idk I'm kind of confused", 'can you just tell us the answer?', "I'm not sure, is it because of the size?"];
const GENERIC = ['I think we are getting closer', 'maybe it depends on more than one thing', 'I agree, that makes sense to me'];

interface Sim {
  id: string;
  nickname: string;
  persona: Persona;
  used: Set<string>;
  pending: ReturnType<typeof setTimeout> | null;
  confusedCount: number;
}

export interface SimOptions {
  /** Multiplies all reply delays (tests use smaller values). */
  speed?: number;
  random?: () => number;
}

export class SimDirector {
  private sims = new Map<string, Sim>();
  /** Lines already said in each group, so simulated students don't parrot each other. */
  private groupUsed = new Map<string, Set<string>>();
  private rand: () => number;
  private speed: number;

  constructor(
    private engine: Engine,
    opts: SimOptions = {},
  ) {
    this.rand = opts.random ?? Math.random;
    this.speed = opts.speed ?? 1;
  }

  add(code: string, count: number, personas?: Persona[]): string[] {
    const added: string[] = [];
    for (let i = 0; i < count; i++) {
      const persona = personas?.[i] ?? PERSONA_CYCLE[(this.sims.size + i) % PERSONA_CYCLE.length];
      let res;
      for (let n = 0; n < NAMES.length * 3; n++) {
        const base = NAMES[(this.sims.size + i + n) % NAMES.length];
        const nick = n < NAMES.length ? base : `${base}${n}`;
        res = this.engine.join(code, nick, { isSim: true });
        if (res.ok) break;
        if (!res.error.includes('nickname')) break;
      }
      if (!res || !res.ok) throw new Error(res && !res.ok ? res.error : 'Could not add simulated student');
      const p = this.engine.participant(res.participantId)!;
      this.sims.set(p.id, { id: p.id, nickname: p.nickname, persona, used: new Set(), pending: null, confusedCount: 0 });
      added.push(p.id);
    }
    return added;
  }

  isSim(id: string) {
    return this.sims.has(id);
  }

  personaOf(id: string) {
    return this.sims.get(id)?.persona;
  }

  private delay(lo: number, hi: number) {
    return (lo + this.rand() * (hi - lo)) * this.speed;
  }

  onGroupMessage(_sessionId: string, msg: ChatMessage) {
    if (msg.sender === 'system' || msg.privateTo) return;
    for (const sim of this.sims.values()) {
      if (sim.id === msg.participantId || sim.pending) continue;
      const g = this.engine.groupOf(sim.id);
      if (!g || g.id !== msg.groupId || g.status !== 'active') continue;
      const addressed = msg.targetId === sim.id || msg.text.includes(sim.nickname);
      let p = 0;
      let wait: [number, number] = [3000, 7000];
      if (msg.sender === 'ai' || msg.sender === 'teacher') {
        p = addressed ? 1 : { eager: 0.4, quiet: 0, dominant: 0.7, confused: 0.3, builder: 0.3 }[sim.persona];
        wait = { eager: [3000, 6000], quiet: [5000, 9000], dominant: [1500, 3500], confused: [4000, 8000], builder: [4000, 7000] }[sim.persona] as [number, number];
      } else if (msg.sender === 'student') {
        p = { eager: 0.1, quiet: 0, dominant: 0.35, confused: 0, builder: 0.35 }[sim.persona];
        wait = [3000, 6000];
      }
      if (!addressed && this.outOfIdeas(sim)) p *= 0.25;
      if (this.rand() >= p) continue;
      const replyTo = msg.sender === 'student' ? msg.nickname : undefined;
      sim.pending = setTimeout(() => {
        sim.pending = null;
        const grp = this.engine.groupOf(sim.id);
        if (!grp || grp.paused || grp.status !== 'active') return;
        void this.engine.studentSend(sim.id, this.line(sim, grp.stage, replyTo));
      }, this.delay(wait[0], wait[1]));
    }
  }

  private outOfIdeas(sim: Sim): boolean {
    const g = this.engine.groupOf(sim.id);
    if (!g) return true;
    const pack = this.engine.sessions.get(g.sessionId)!.pack;
    const used = this.groupUsed.get(g.id);
    return !!used && pack.simLines[g.stage].every((l) => used.has(l));
  }

  private line(sim: Sim, stage: Stage, replyTo?: string): string {
    const pack = this.engine.sessions.get(this.engine.participant(sim.id)!.sessionId)!.pack;
    if (sim.persona === 'confused' && (stage === 'hook' || stage === 'probe') && sim.confusedCount < 2 && this.rand() < 0.6) {
      return CONFUSED[sim.confusedCount++ % CONFUSED.length];
    }
    const gid = this.engine.groupOf(sim.id)!.id;
    const used = this.groupUsed.get(gid) ?? new Set<string>();
    this.groupUsed.set(gid, used);
    const pool = pack.simLines[stage].filter((l) => !used.has(l));
    const base = pool.length ? pool[Math.floor(this.rand() * pool.length)] : GENERIC[Math.floor(this.rand() * GENERIC.length)];
    used.add(base);
    sim.used.add(base);
    if (replyTo && (sim.persona === 'builder' || this.rand() < 0.3)) return `I agree with ${replyTo}, and also ${base}`;
    return base;
  }

  clear() {
    for (const s of this.sims.values()) if (s.pending) clearTimeout(s.pending);
    this.sims.clear();
  }
}
