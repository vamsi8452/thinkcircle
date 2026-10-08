import type {
  Alert,
  AlertKind,
  AuditEntry,
  Behaviour,
  ChatMessage,
  ConceptPack,
  EngagementState,
  MoveType,
  ScoreEvent,
  Scoreboard,
  SessionStatus,
  Stage,
  StudentState,
  TeacherGroupView,
  TeacherParticipantView,
  TeacherState,
  GroupView,
} from '../../shared/types.js';
import { RUBRIC_VERSION, STAGES } from '../../shared/types.js';
import type { AiProvider } from '../ai/provider.js';
import { buildGroupSummary, checkAiMessage, composeRules, nextStage, pickBadge, readingGrade } from '../core/compose.js';
import { CLASSIFY_SILENCE_EVERY_MS, classifyEngagement } from '../core/engagement.js';
import { decideMove, type BatchItem, type Decision, type MemberCtx } from '../core/facilitator.js';
import { GROUP_NAMES, pickGroupForLateJoiner, splitIntoGroups } from '../core/grouping.js';
import { generateJoinCode, normalizeCode } from '../core/joinCode.js';
import { GENTLE_REMINDERS, type ModResult, type Moderator } from '../core/moderation.js';
import { validateNickname } from '../core/nickname.js';
import { RUBRIC, TEAM_BONUS_REASON, applyStageCap, scoreMessage } from '../core/scoring.js';
import { readSignals, type MessageSignals } from '../core/signals.js';
import { newId, pick } from '../core/text.js';
import { getPack, summarizePack } from '../packs/index.js';

export interface Timings {
  burstQuietMs: number;
  burstMaxMs: number;
  aiTimeoutMs: number;
  tickMs: number;
  warnBeforeEndMs: number;
  reconnectGraceMs: number;
  moderationTimeoutMs: number;
  aiFailAlertAfter: number;
  /** Let students talk to each other: routine replies wait until this long after the last AI turn. */
  minAiGapMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  burstQuietMs: 1000,
  burstMaxMs: 5000, // edge case: wait up to 5s for a burst
  aiTimeoutMs: 10_000, // edge case: fallback after 10s
  tickMs: 5000,
  warnBeforeEndMs: 120_000, // FR-007
  reconnectGraceMs: 120_000, // NFR-004
  moderationTimeoutMs: 3000,
  aiFailAlertAfter: 3,
  minAiGapMs: 7000,
};

export interface EngineEvents {
  /** Something in this session changed; push fresh snapshots. */
  sessionChanged(sessionId: string): void;
  award(participantId: string, events: ScoreEvent[]): void;
  notice(participantId: string, kind: string, text: string): void;
  removed?(participantId: string): void;
  /** Every message that becomes visible in a group (used by simulated students). */
  groupMessage?(sessionId: string, msg: ChatMessage): void;
}

export interface EngineDeps {
  ai: AiProvider;
  moderator: Moderator;
  events: EngineEvents;
  timings?: Partial<Timings>;
}

interface Participant {
  id: string;
  token: string;
  sessionId: string;
  nickname: string;
  groupId?: string;
  joinedAt: number;
  groupJoinedAt?: number;
  lastSpokeAt?: number;
  lastAddressedAt: number | null;
  messageCount: number;
  left: boolean;
  removed: boolean;
  connected: boolean;
  disconnectedAt?: number;
  state: EngagementState;
  stateConfidence: number;
  stateReason: string;
  lastClassifiedAt: number;
  understood: Set<Stage>;
  firstDone: boolean;
  recent: { ts: number; signals: MessageSignals; scoredReasoning: number }[];
  isSim: boolean;
}

interface Group {
  id: string;
  sessionId: string;
  name: string;
  memberIds: string[];
  stage: Stage;
  stageStartedAt: number;
  startedAt: number;
  paused: boolean;
  pausedAt?: number;
  status: 'active' | 'complete';
  teamBonusAwarded: boolean;
  lastAiAt: number;
  lastStudentMsgAt: number;
  recentTargets: (string | null)[];
  burst: { timer: ReturnType<typeof setTimeout> | null; firstAt: number; items: BatchItem[] } | null;
  aiBusy: boolean;
  queued: BatchItem[];
  thinking: boolean;
  stalled: boolean;
  hintLevel: Map<string, number>;
  ideas: Map<string, string[]>;
  summary?: string;
  aiFailStreak: number;
  turn: number;
  messages: ChatMessage[];
}

interface Session {
  id: string;
  code: string;
  teacherId: string;
  pack: ConceptPack;
  groupSize: number;
  durationMs: number;
  showIndividual: boolean;
  status: SessionStatus;
  locked: boolean;
  createdAt: number;
  startedAt?: number;
  endsAt?: number;
  warned: boolean;
  groups: Group[];
  participants: Map<string, Participant>;
  scoreEvents: ScoreEvent[];
  alerts: Alert[];
  audit: AuditEntry[];
  aiCost: { calls: number; promptTokens: number; outputTokens: number; totalMs: number; fallbacks: number };
  warnings: string[];
  held: { participantId: string; messageId: string; text: string }[];
  moderationDown: boolean;
  scoreboard?: Scoreboard;
}

export interface Teacher {
  id: string;
  email: string;
  token: string;
}

export interface CreateSessionInput {
  packId: string;
  groupSize: number;
  durationMin: number;
  showIndividualRankings?: boolean;
}

export type JoinResult = { ok: true; participantId: string; token: string; sessionId: string } | { ok: false; error: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Engine {
  readonly sessions = new Map<string, Session>();
  private byCode = new Map<string, string>();
  private teachers = new Map<string, Teacher>();
  private teacherByToken = new Map<string, Teacher>();
  private participantByToken = new Map<string, Participant>();
  private participantIndex = new Map<string, Participant>();
  private groupIndex = new Map<string, Group>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  readonly t: Timings;

  constructor(private deps: EngineDeps) {
    this.t = { ...DEFAULT_TIMINGS, ...deps.timings };
  }

  get aiName() {
    return this.deps.ai.name;
  }

  setAi(ai: AiProvider) {
    this.deps.ai = ai;
  }

  startTicker() {
    if (!this.ticker) this.ticker = setInterval(() => this.tick(), this.t.tickMs);
  }

  stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private now() {
    return Date.now();
  }

  // ---------------- Teachers (FR-001: demo sign-in; Google/email magic link is a later task) ----------------

  loginTeacher(email: string): Teacher {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email address.');
    const existing = [...this.teachers.values()].find((t) => t.email === clean);
    if (existing) return existing;
    const teacher: Teacher = { id: newId('t'), email: clean, token: newId('tt') + newId('x') };
    this.teachers.set(teacher.id, teacher);
    this.teacherByToken.set(teacher.token, teacher);
    return teacher;
  }

  teacherFromToken(token: string): Teacher | undefined {
    return this.teacherByToken.get(token);
  }

  // ---------------- Sessions (US-1) ----------------

  createSession(teacherId: string, input: CreateSessionInput): Session {
    const pack = getPack(input.packId);
    if (!pack) throw new Error('Unknown concept pack.');
    const groupSize = clamp(Math.round(input.groupSize), 3, 6); // FR-002
    const durationMin = clamp(Math.round(input.durationMin || 20), 10, 40);
    const code = generateJoinCode((c) => this.byCode.has(c)); // FR-003
    const s: Session = {
      id: newId('s'),
      code,
      teacherId,
      pack,
      groupSize,
      durationMs: durationMin * 60_000,
      showIndividual: !!input.showIndividualRankings,
      status: 'waiting',
      locked: false,
      createdAt: this.now(),
      warned: false,
      groups: [],
      participants: new Map(),
      scoreEvents: [],
      alerts: [],
      audit: [],
      aiCost: { calls: 0, promptTokens: 0, outputTokens: 0, totalMs: 0, fallbacks: 0 },
      warnings: [],
      held: [],
      moderationDown: false,
    };
    this.sessions.set(s.id, s);
    this.byCode.set(code, s.id);
    return s;
  }

  sessionsForTeacher(teacherId: string) {
    return [...this.sessions.values()]
      .filter((s) => s.teacherId === teacherId)
      .map((s) => ({ id: s.id, code: s.code, status: s.status, packTitle: s.pack.title, createdAt: s.createdAt, students: s.participants.size }));
  }

  ownsSession(teacherId: string, sessionId: string): boolean {
    return this.sessions.get(sessionId)?.teacherId === teacherId;
  }

  join(codeInput: string, nicknameInput: string, opts: { isSim?: boolean } = {}): JoinResult {
    const sid = this.byCode.get(normalizeCode(codeInput));
    const s = sid ? this.sessions.get(sid) : undefined;
    if (!s || s.status === 'ended') return { ok: false, error: "That code didn't work. Check it with your teacher." };
    if (s.locked) return { ok: false, error: 'This session is closed to new players.' };
    const taken = [...s.participants.values()].filter((p) => !p.removed).map((p) => p.nickname);
    const v = validateNickname(nicknameInput, taken); // FR-004, FR-005
    if (!v.ok) return { ok: false, error: v.error };
    const now = this.now();
    const p: Participant = {
      id: newId('p'),
      token: newId('pt') + newId('x'),
      sessionId: s.id,
      nickname: v.nickname,
      joinedAt: now,
      lastAddressedAt: null,
      messageCount: 0,
      left: false,
      removed: false,
      connected: true,
      state: 'engaged',
      stateConfidence: 0.5,
      stateReason: 'Just joined',
      lastClassifiedAt: now,
      understood: new Set(),
      firstDone: false,
      recent: [],
      isSim: !!opts.isSim,
    };
    s.participants.set(p.id, p);
    this.participantByToken.set(p.token, p);
    this.participantIndex.set(p.id, p);
    if (s.status === 'running') this.placeLateJoiner(s, p);
    this.changed(s);
    return { ok: true, participantId: p.id, token: p.token, sessionId: s.id };
  }

  private placeLateJoiner(s: Session, p: Participant) {
    const sizes = s.groups.map((g) => this.activeMembers(g).length);
    let idx = pickGroupForLateJoiner(sizes);
    if (idx === -1) {
      const g = this.newGroup(s, [], s.groups.length);
      s.groups.push(g);
      idx = s.groups.length - 1;
    }
    const g = s.groups[idx];
    g.memberIds.push(p.id);
    p.groupId = g.id;
    p.groupJoinedAt = this.now();
    this.postSystem(g, `${p.nickname} joined the group. Welcome!`);
  }

  resume(token: string): Participant | undefined {
    const p = this.participantByToken.get(token);
    if (!p || p.removed) return undefined;
    const s = this.sessions.get(p.sessionId);
    if (!s) return undefined;
    p.connected = true;
    p.disconnectedAt = undefined;
    if (p.left && s.status !== 'ended') p.left = false; // NFR-004
    this.changed(s);
    return p;
  }

  disconnect(participantId: string) {
    const p = this.participantIndex.get(participantId);
    if (!p || p.isSim) return;
    p.connected = false;
    p.disconnectedAt = this.now();
    const s = this.sessions.get(p.sessionId);
    if (s) this.changed(s);
  }

  participant(id: string) {
    return this.participantIndex.get(id);
  }

  participantFromToken(token: string) {
    return this.participantByToken.get(token);
  }

  private newGroup(s: Session, memberIds: string[], i: number): Group {
    const now = this.now();
    const g: Group = {
      id: newId('g'),
      sessionId: s.id,
      name: `Team ${GROUP_NAMES[i % GROUP_NAMES.length]}${i >= GROUP_NAMES.length ? ` ${Math.floor(i / GROUP_NAMES.length) + 1}` : ''}`,
      memberIds,
      stage: 'hook',
      stageStartedAt: now,
      startedAt: now,
      paused: false,
      status: 'active',
      teamBonusAwarded: false,
      lastAiAt: now,
      lastStudentMsgAt: now,
      recentTargets: [],
      burst: null,
      aiBusy: false,
      queued: [],
      thinking: false,
      stalled: false,
      hintLevel: new Map(),
      ideas: new Map(),
      aiFailStreak: 0,
      turn: 0,
      messages: [],
    };
    this.groupIndex.set(g.id, g);
    return g;
  }

  /** FR-006: teacher presses Begin. */
  begin(sessionId: string): { warnings: string[] } {
    const s = this.mustSession(sessionId);
    if (s.status !== 'waiting') throw new Error('Session already started.');
    const waiting = [...s.participants.values()].filter((p) => !p.removed);
    if (waiting.length === 0) throw new Error('No students have joined yet.');
    const { groups, warnings } = splitIntoGroups(
      waiting.map((p) => p.id),
      s.groupSize,
    );
    const now = this.now();
    s.status = 'running';
    s.startedAt = now;
    s.endsAt = now + s.durationMs;
    s.warnings.push(...warnings);
    if (warnings.length) this.alert(s, { level: 'info', kind: 'small-class', text: warnings.join(' ') });
    s.groups = groups.map((ids, i) => {
      const g = this.newGroup(s, ids, i);
      ids.forEach((id) => {
        const p = s.participants.get(id)!;
        p.groupId = g.id;
        p.groupJoinedAt = now;
      });
      return g;
    });
    for (const g of s.groups) void this.aiTurn(s, g, 'start', []);
    this.changed(s);
    return { warnings };
  }

  // ---------------- Student messages ----------------

  async studentSend(participantId: string, rawText: string): Promise<{ ok: boolean; error?: string }> {
    const p = this.participantIndex.get(participantId);
    if (!p || p.removed) return { ok: false, error: 'You are not in this session.' };
    const s = this.mustSession(p.sessionId);
    if (s.status === 'waiting') return { ok: false, error: 'Wait for your teacher to begin.' };
    if (s.status === 'ended') return { ok: false, error: 'This session has ended.' };
    const g = p.groupId ? this.groupIndex.get(p.groupId) : undefined;
    if (!g) return { ok: false, error: 'You are not in a group yet.' };
    if (g.paused) return { ok: false, error: 'Paused by your teacher.' };
    const text = rawText.trim().slice(0, 600);
    if (!text) return { ok: false, error: 'Type a message first.' };
    p.connected = true;
    if (p.left) p.left = false;

    const msg: ChatMessage = { id: newId('m'), groupId: g.id, sender: 'student', participantId: p.id, nickname: p.nickname, text, ts: this.now(), status: 'held' };
    g.messages.push(msg);

    let mod: ModResult;
    try {
      mod = await this.withTimeout(this.deps.moderator.check(text), this.t.moderationTimeoutMs, 'moderation timeout');
    } catch {
      // Edge case: moderation unavailable → hold, don't show, tell the teacher.
      s.held.push({ participantId: p.id, messageId: msg.id, text });
      if (!s.moderationDown) {
        s.moderationDown = true;
        this.alert(s, { level: 'warning', kind: 'moderation-unavailable', text: 'Safety checks are unavailable. Student messages are being held until they recover.' });
      }
      this.deps.events.notice(p.id, 'held', 'Your message is waiting for a safety check and will appear soon.');
      this.changed(s);
      return { ok: true };
    }
    this.processModerated(s, g, p, msg, mod);
    return { ok: true };
  }

  private processModerated(s: Session, g: Group, p: Participant, msg: ChatMessage, mod: ModResult) {
    const now = this.now();
    this.log(s, { type: 'moderation', groupId: g.id, participantId: p.id, inputs: { messageId: msg.id }, output: mod, reason: mod.reason });

    if (mod.action !== 'allow') {
      msg.status = 'hidden'; // FR-041
      msg.flag = mod.category;
      const kind = mod.category as AlertKind;
      this.alert(s, {
        level: mod.alertLevel ?? 'warning',
        kind,
        groupId: g.id,
        participantId: p.id,
        nickname: p.nickname,
        text: mod.action === 'urgent' ? `URGENT: ${p.nickname} may be unsafe or in distress. Please check in with them now.` : `${p.nickname}'s message was hidden: ${mod.reason}.`,
        excerpt: msg.text,
      });
      this.deps.events.notice(p.id, 'reminder', GENTLE_REMINDERS[mod.category ?? 'profanity']);
      if (mod.action === 'urgent') {
        // FR-042: supportive, non-counselling reply, shown only to this student.
        const reply: ChatMessage = {
          id: newId('m'),
          groupId: g.id,
          sender: 'ai',
          text: composeRules({ move: 'distress', targetId: p.id, reason: 'Distress signals' }, this.composeCtx(s, g)),
          ts: now,
          status: 'shown',
          move: 'distress',
          targetId: p.id,
          privateTo: p.id,
          reason: 'Distress signals: supportive reply, teacher alerted (FR-042)',
        };
        g.messages.push(reply);
        this.log(s, { type: 'move', groupId: g.id, participantId: p.id, inputs: { trigger: 'distress' }, output: reply.text, reason: reply.reason! });
      }
      this.changed(s);
      return;
    }

    msg.status = 'shown';
    if (mod.category) msg.flag = mod.category;
    if (mod.category === 'injection') {
      this.alert(s, { level: 'info', kind: 'injection', groupId: g.id, participantId: p.id, nickname: p.nickname, text: `${p.nickname} tried to change the AI's rules. The AI returned to the topic.`, excerpt: msg.text });
    }
    p.messageCount += 1;
    p.lastSpokeAt = now;
    g.lastStudentMsgAt = now;
    g.stalled = false;
    this.deps.events.groupMessage?.(s.id, msg);

    const signals = readSignals(msg.text, s.pack);

    // Scoring (US-4)
    const peers = this.activeMembers(g).filter((m) => m.id !== p.id);
    const lastOther = [...g.messages].reverse().find((m) => m.sender === 'student' && m.status === 'shown' && m.participantId !== p.id);
    const raw = scoreMessage({ text: msg.text, signals, isFirstContribution: !p.firstDone, peers: peers.map((m) => m.nickname), lastOtherSpeaker: lastOther?.nickname });
    const capped = applyStageCap(raw, this.earnedThisStage(s, p.id, g.stage));
    p.firstDone = true;
    const events: ScoreEvent[] = capped.map((a) => ({
      id: newId('e'),
      sessionId: s.id,
      groupId: g.id,
      participantId: p.id,
      behaviour: a.behaviour,
      points: a.points,
      reason: a.reason,
      messageId: msg.id,
      stage: g.stage,
      ts: now,
    }));
    s.scoreEvents.push(...events);
    this.log(s, { type: 'score', groupId: g.id, participantId: p.id, inputs: { messageId: msg.id, text: msg.text, signals }, output: { raw, awarded: capped }, reason: capped.map((a) => a.reason).join('; ') || (raw.length ? 'Stage cap reached' : 'No rubric behaviour detected') });
    if (events.length) this.deps.events.award(p.id, events);
    this.checkTeamBonus(s, g);

    // Understanding of the current stage (FR-013)
    const stageDef = s.pack.stages[g.stage];
    const stageIdeas = signals.keyIdeas.filter((k) => stageDef.keyIdeaIds.includes(k));
    const understood =
      stageDef.keyIdeaIds.length === 0
        ? signals.onTopic && signals.words >= 3
        : g.stage === 'consolidate'
          ? stageIdeas.length > 0 && signals.causal
          : stageIdeas.length > 0;
    if (understood) p.understood.add(g.stage);
    for (const k of signals.keyIdeas) {
      const list = g.ideas.get(k) ?? [];
      list.push(p.nickname);
      g.ideas.set(k, list);
    }

    // Engagement (US-3)
    const reasoning = capped.find((a) => a.behaviour === 'reasoning')?.points ?? raw.find((a) => a.behaviour === 'reasoning')?.points ?? 0;
    p.recent.unshift({ ts: now, signals, scoredReasoning: reasoning });
    p.recent = p.recent.slice(0, 5);
    this.classify(s, g, p);

    // Burst handling: wait for a short quiet gap (max 5s) then respond to the batch together.
    const item: BatchItem = { participantId: p.id, text: msg.text, signals, mod };
    if (!g.burst) g.burst = { timer: null, firstAt: now, items: [] };
    g.burst.items.push(item);
    if (g.burst.timer) clearTimeout(g.burst.timer);
    const needsReply = g.burst.items.some((b) => b.signals.answerRequest || b.signals.frustration || b.signals.confusion || b.signals.nonEnglish || b.mod.category);
    const burstWait = Math.min(this.t.burstQuietMs, g.burst.firstAt + this.t.burstMaxMs - now);
    const paceWait = needsReply ? 0 : g.lastAiAt + this.t.minAiGapMs - now;
    const wait = Math.max(0, burstWait, paceWait);
    g.burst.timer = setTimeout(() => {
      const batch = g.burst?.items ?? [];
      g.burst = null;
      void this.aiTurn(s, g, 'messages', batch);
    }, wait);

    this.changed(s);
  }

  private checkTeamBonus(s: Session, g: Group) {
    if (g.teamBonusAwarded) return;
    const members = this.activeMembers(g);
    if (members.length === 0 || !members.every((m) => m.firstDone)) return;
    g.teamBonusAwarded = true; // FR-034
    const ev: ScoreEvent = { id: newId('e'), sessionId: s.id, groupId: g.id, participantId: null, behaviour: 'team-bonus', points: RUBRIC.teamBonus, reason: TEAM_BONUS_REASON, stage: g.stage, ts: this.now() };
    s.scoreEvents.push(ev);
    this.log(s, { type: 'score', groupId: g.id, inputs: { members: members.map((m) => m.nickname) }, output: ev, reason: TEAM_BONUS_REASON });
    this.postSystem(g, `🎉 Every voice heard! +${RUBRIC.teamBonus} team bonus for ${g.name}.`);
    members.forEach((m) => this.deps.events.award(m.id, [ev]));
  }

  private earnedThisStage(s: Session, pid: string, stage: Stage) {
    return s.scoreEvents.filter((e) => e.participantId === pid && e.stage === stage).reduce((a, e) => a + e.points, 0);
  }

  private classify(s: Session, g: Group, p: Participant) {
    const now = this.now();
    const members = this.activeMembers(g);
    const avg = members.reduce((a, m) => a + m.messageCount, 0) / Math.max(1, members.length);
    const r = classifyEngagement({
      now,
      recent: p.recent,
      messageCount: p.messageCount,
      groupAvgCount: avg,
      activeMembers: members.length,
      silentMs: now - (p.lastSpokeAt ?? p.groupJoinedAt ?? p.joinedAt),
    });
    p.lastClassifiedAt = now;
    if (r.state !== p.state) {
      this.log(s, { type: 'engagement', groupId: g.id, participantId: p.id, inputs: { messageCount: p.messageCount, groupAvg: avg }, output: r.state, reason: r.reason });
    }
    p.state = r.state;
    p.stateConfidence = r.confidence;
    p.stateReason = r.reason;
  }

  // ---------------- AI turns (US-2, US-3) ----------------

  private memberCtx(g: Group): MemberCtx[] {
    return this.activeMembers(g).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      messageCount: p.messageCount,
      lastSpokeAt: p.lastSpokeAt ?? p.groupJoinedAt ?? p.joinedAt,
      lastAddressedAt: p.lastAddressedAt,
      state: p.state,
      understoodStage: p.understood.has(g.stage),
    }));
  }

  private composeCtx(s: Session, g: Group, d?: Decision) {
    const nick = (id?: string) => (id ? (this.participantIndex.get(id)?.nickname ?? 'friend') : 'everyone');
    const lastSpeaker = [...g.messages].reverse().find((m) => m.sender === 'student' && m.status === 'shown');
    return {
      pack: s.pack,
      stage: g.stage,
      nick,
      allNicks: this.activeMembers(g).map((p) => p.nickname),
      hintLevel: d?.targetId ? (g.hintLevel.get(d.targetId) ?? 0) : 0,
      turn: g.turn,
      lastSpeakerNick: lastSpeaker?.nickname,
    };
  }

  private async aiTurn(s: Session, g: Group, trigger: 'start' | 'messages' | 'tick', batch: BatchItem[], forced?: Decision) {
    if (s.status !== 'running' || g.paused || g.status !== 'active') return;
    if (g.aiBusy) {
      if (trigger === 'messages') g.queued.push(...batch);
      return;
    }
    const now = this.now();
    const lastOther = [...g.messages].reverse().find((m) => m.sender === 'student' && m.status === 'shown');
    const decision =
      forced ??
      decideMove({
        trigger,
        now,
        stage: g.stage,
        stageElapsedMs: now - g.stageStartedAt,
        stageLimitMs: s.pack.stages[g.stage].timeShare * s.durationMs,
        groupStartedAt: g.startedAt,
        members: this.memberCtx(g),
        batch,
        recentTargets: g.recentTargets,
        lastAiAt: g.lastAiAt,
        lastStudentMsgAt: g.lastStudentMsgAt,
        stalled: g.stalled,
        lastOtherMessage: lastOther?.participantId ? { participantId: lastOther.participantId, text: lastOther.text } : undefined,
      });
    if (!decision) return;

    g.aiBusy = true;
    try {
      if (decision.stalled && !g.stalled) {
        g.stalled = true;
        this.alert(s, { level: 'info', kind: 'stalled', groupId: g.id, text: `${g.name} has been quiet for 2 minutes.` });
      }
      if (decision.advance) {
        const from = g.stage;
        g.stage = nextStage(g.stage);
        g.stageStartedAt = now;
        this.log(s, { type: 'stage', groupId: g.id, inputs: { from }, output: g.stage, reason: decision.reason });
      }
      if (decision.complete) {
        this.finishGroup(s, g, decision.reason);
        return;
      }

      const ctx = this.composeCtx(s, g, decision);
      const draft = composeRules(decision, ctx);
      if (decision.move === 'hint' && decision.style !== 'analogy' && decision.targetId) {
        g.hintLevel.set(decision.targetId, (g.hintLevel.get(decision.targetId) ?? 0) + 1);
      }
      const { text, source } = this.isRules() ? this.rulesText(s, g, decision, draft) : await this.generate(s, g, decision, draft);

      const msg: ChatMessage = {
        id: newId('m'),
        groupId: g.id,
        sender: 'ai',
        text,
        ts: this.now(),
        status: 'shown',
        move: source === 'fallback' ? 'fallback' : decision.move,
        targetId: decision.targetId,
        reason: decision.reason,
      };
      if (s.status !== 'running' || g.status !== 'active') return;
      g.messages.push(msg);
      g.lastAiAt = msg.ts;
      g.turn += 1;
      g.recentTargets = [...g.recentTargets, decision.targetId ?? null].slice(-5);
      if (decision.targetId) {
        const tp = this.participantIndex.get(decision.targetId);
        if (tp) tp.lastAddressedAt = msg.ts;
      }
      this.log(s, {
        type: 'move',
        groupId: g.id,
        participantId: decision.targetId,
        inputs: { trigger, batch: batch.map((b) => ({ pid: b.participantId, text: b.text })), stage: g.stage, states: this.activeMembers(g).map((p) => [p.nickname, p.state]) },
        output: { move: decision.move, text, source, readingGrade: Math.round(readingGrade(text) * 10) / 10 },
        reason: decision.reason,
      });
      this.deps.events.groupMessage?.(s.id, msg);
    } finally {
      g.aiBusy = false;
      g.thinking = false;
      this.changed(s);
    }
    if (g.queued.length) {
      const q = g.queued;
      g.queued = [];
      void this.aiTurn(s, g, 'messages', q);
    }
  }

  private isRules() {
    return this.deps.ai.name.startsWith('rules');
  }

  /** Rules provider: synchronous, so moves land in order with the messages that caused them. */
  private rulesText(s: Session, g: Group, d: Decision, draft: string): { text: string; source: 'rules' | 'fallback' } {
    return checkAiMessage(draft, s.pack, d.move).ok ? { text: draft, source: 'rules' } : { text: pick(s.pack.fallbackQuestions, g.turn), source: 'fallback' };
  }

  /** Run the provider with the guard (FR-012) and the 10-second fallback (edge case §6). */
  private async generate(s: Session, g: Group, d: Decision, draft: string): Promise<{ text: string; source: 'ai' | 'rules' | 'fallback' }> {
    const ai = this.deps.ai;
    const fallbackQ = () => pick(s.pack.fallbackQuestions, g.turn);
    const draftOk = checkAiMessage(draft, s.pack, d.move).ok;
    g.thinking = true;
    this.changed(s);
    const transcript = g.messages
      .filter((m) => m.status === 'shown' && !m.privateTo)
      .slice(-8)
      .map((m) => ({ who: m.sender === 'ai' ? 'ThinkCircle' : m.sender === 'teacher' ? 'Teacher' : (m.nickname ?? 'Student'), text: m.text }));
    const deadline = this.now() + this.t.aiTimeoutMs;
    let rejected: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - this.now();
      if (remaining <= 0) break;
      const started = this.now();
      try {
        const res = await this.withTimeout(
          ai.generate({ pack: s.pack, stage: g.stage, decision: d, targetNick: d.targetId ? this.participantIndex.get(d.targetId)?.nickname : undefined, peerNick: d.peerId ? this.participantIndex.get(d.peerId)?.nickname : undefined, transcript, draft, rejectedBecause: rejected }, AbortSignal.timeout(remaining)),
          remaining,
          'AI timeout',
        );
        s.aiCost.calls += 1;
        s.aiCost.promptTokens += res.promptTokens ?? 0;
        s.aiCost.outputTokens += res.outputTokens ?? 0;
        s.aiCost.totalMs += this.now() - started;
        const guard = checkAiMessage(res.text, s.pack, d.move);
        if (guard.ok) {
          g.aiFailStreak = 0;
          return { text: res.text, source: 'ai' };
        }
        rejected = guard.problems;
        this.log(s, { type: 'move', groupId: g.id, inputs: { attempt, text: res.text }, output: 'rejected', reason: `Guard rejected AI message: ${guard.problems.join('; ')}` });
      } catch {
        s.aiCost.totalMs += this.now() - started;
        break;
      }
    }
    // Model failed, timed out, or kept breaking the rules: use the pack-based message.
    s.aiCost.fallbacks += 1;
    if (!rejected) {
      g.aiFailStreak += 1;
      if (g.aiFailStreak === this.t.aiFailAlertAfter) {
        this.alert(s, { level: 'warning', kind: 'ai-unavailable', groupId: g.id, text: `The AI model is slow or unavailable for ${g.name}; using backup questions from the pack.` });
      }
    }
    return draftOk ? { text: draft, source: 'rules' } : { text: fallbackQ(), source: 'fallback' };
  }

  private finishGroup(s: Session, g: Group, reason: string) {
    if (!g.summary) {
      g.summary = buildGroupSummary(s.pack, g.ideas); // FR-015
      const msg: ChatMessage = { id: newId('m'), groupId: g.id, sender: 'ai', text: g.summary, ts: this.now(), status: 'shown', move: 'summary', reason };
      g.messages.push(msg);
      this.log(s, { type: 'move', groupId: g.id, inputs: { ideas: Object.fromEntries(g.ideas) }, output: g.summary, reason });
      this.deps.events.groupMessage?.(s.id, msg);
    }
    g.status = 'complete';
    if (g.burst?.timer) clearTimeout(g.burst.timer);
    g.burst = null;
  }

  // ---------------- Ticker: silence, stage timers, end of session ----------------

  tick() {
    const now = this.now();
    for (const s of this.sessions.values()) {
      if (s.status !== 'running') continue;
      if (s.endsAt && now >= s.endsAt) {
        this.endSession(s.id); // FR-007
        continue;
      }
      if (!s.warned && s.endsAt && s.endsAt - now <= this.t.warnBeforeEndMs) {
        s.warned = true;
        s.groups.forEach((g) => this.postSystem(g, '⏳ 2 minutes left. Start wrapping up your ideas!'));
        this.changed(s);
      }
      // Reconnect grace (NFR-004): after 2 minutes away, mark as left early.
      for (const p of s.participants.values()) {
        if (!p.connected && !p.left && p.disconnectedAt && now - p.disconnectedAt >= this.t.reconnectGraceMs) {
          p.left = true;
          this.changed(s);
        }
      }
      if (s.moderationDown) void this.retryHeld(s);
      for (const g of s.groups) {
        if (g.paused || g.status !== 'active' || g.aiBusy || g.burst) continue;
        for (const p of this.activeMembers(g)) {
          if (now - p.lastClassifiedAt >= CLASSIFY_SILENCE_EVERY_MS) this.classify(s, g, p); // FR-020
        }
        void this.aiTurn(s, g, 'tick', []);
      }
    }
  }

  private async retryHeld(s: Session) {
    if (s.held.length === 0) {
      s.moderationDown = false;
      return;
    }
    const first = s.held[0];
    try {
      await this.withTimeout(this.deps.moderator.check(first.text), this.t.moderationTimeoutMs, 'moderation timeout');
    } catch {
      return;
    }
    s.moderationDown = false;
    const held = s.held;
    s.held = [];
    this.alert(s, { level: 'info', kind: 'moderation-unavailable', text: `Safety checks recovered. ${held.length} held message(s) were checked.` });
    for (const h of held) {
      const p = this.participantIndex.get(h.participantId);
      const g = p?.groupId ? this.groupIndex.get(p.groupId) : undefined;
      const msg = g?.messages.find((m) => m.id === h.messageId);
      if (!p || !g || !msg) continue;
      try {
        const mod = await this.deps.moderator.check(h.text);
        this.processModerated(s, g, p, msg, mod);
      } catch {
        s.held.push(h);
        s.moderationDown = true;
      }
    }
  }

  endSession(sessionId: string) {
    const s = this.mustSession(sessionId);
    if (s.status === 'ended') return;
    if (s.status === 'waiting') {
      s.status = 'ended';
      this.byCode.delete(s.code);
      this.changed(s);
      return;
    }
    for (const g of s.groups) this.finishGroup(s, g, 'Session ended');
    s.status = 'ended';
    s.endsAt = this.now();
    this.byCode.delete(s.code); // FR-003: code valid until the session ends
    s.scoreboard = this.buildScoreboard(s);
    // NFR-007: engagement states are deleted at session end.
    for (const p of s.participants.values()) {
      p.state = 'engaged';
      p.stateReason = '';
      p.recent = [];
    }
    this.changed(s);
  }

  // ---------------- Teacher controls (US-6) ----------------

  setPaused(sessionId: string, groupId: string, paused: boolean) {
    const s = this.mustSession(sessionId);
    const g = this.mustGroup(s, groupId);
    g.paused = paused;
    if (paused && g.burst?.timer) {
      clearTimeout(g.burst.timer);
      g.burst = null;
    }
    if (paused) g.pausedAt = this.now();
    if (!paused && g.pausedAt) {
      // Paused time doesn't count against the stage timer.
      g.stageStartedAt += this.now() - g.pausedAt;
      g.lastStudentMsgAt = this.now();
      g.pausedAt = undefined;
    }
    this.postSystem(g, paused ? '⏸ Paused by your teacher.' : '▶️ Your teacher resumed the discussion.');
    this.changed(s);
  }

  teacherMessage(sessionId: string, groupId: string, text: string) {
    const s = this.mustSession(sessionId);
    const g = this.mustGroup(s, groupId);
    const clean = text.trim().slice(0, 600);
    if (!clean) return;
    const msg: ChatMessage = { id: newId('m'), groupId: g.id, sender: 'teacher', text: clean, ts: this.now(), status: 'shown' };
    g.messages.push(msg);
    this.deps.events.groupMessage?.(s.id, msg);
    this.changed(s);
  }

  broadcast(sessionId: string, text: string) {
    const s = this.mustSession(sessionId);
    s.groups.forEach((g) => this.teacherMessage(sessionId, g.id, text));
  }

  setLocked(sessionId: string, locked: boolean) {
    const s = this.mustSession(sessionId);
    s.locked = locked;
    this.changed(s);
  }

  removeParticipant(sessionId: string, participantId: string) {
    const s = this.mustSession(sessionId);
    const p = s.participants.get(participantId);
    if (!p) return;
    p.removed = true;
    p.left = true;
    p.connected = false;
    this.participantByToken.delete(p.token);
    const g = p.groupId ? this.groupIndex.get(p.groupId) : undefined;
    if (g) this.postSystem(g, `${p.nickname} has left the group.`);
    this.deps.events.removed?.(p.id);
    this.changed(s);
  }

  adjustScore(sessionId: string, eventId: string, points: number, reason: string, by: string) {
    const s = this.mustSession(sessionId);
    const e = s.scoreEvents.find((x) => x.id === eventId);
    if (!e) throw new Error('Score not found.');
    const pts = clamp(Math.round(points), 0, 10);
    const why = reason.trim() || 'Teacher adjustment';
    const before = e.override?.points ?? e.points;
    e.override = { points: pts, reason: why, by, ts: this.now() }; // FR-052
    this.log(s, { type: 'override', groupId: e.groupId, participantId: e.participantId ?? undefined, inputs: { eventId, before }, output: pts, reason: `${by}: ${why}` });
    if (s.status === 'ended') s.scoreboard = this.buildScoreboard(s);
    this.changed(s);
  }

  acknowledgeAlert(sessionId: string, alertId: string) {
    const s = this.mustSession(sessionId);
    const a = s.alerts.find((x) => x.id === alertId);
    if (a) a.acknowledged = true;
    this.changed(s);
  }

  deleteSession(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    for (const g of s.groups) {
      if (g.burst?.timer) clearTimeout(g.burst.timer);
      this.groupIndex.delete(g.id);
    }
    for (const p of s.participants.values()) {
      this.participantByToken.delete(p.token);
      this.participantIndex.delete(p.id);
      this.deps.events.removed?.(p.id);
    }
    this.byCode.delete(s.code);
    this.sessions.delete(sessionId); // FR-055
  }

  // ---------------- Views ----------------

  private points(s: Session, pid: string) {
    return s.scoreEvents.filter((e) => e.participantId === pid).reduce((a, e) => a + (e.override?.points ?? e.points), 0);
  }

  private teamScore(s: Session, g: Group) {
    return s.scoreEvents.filter((e) => e.groupId === g.id).reduce((a, e) => a + (e.override?.points ?? e.points), 0);
  }

  private groupView(s: Session, g: Group): GroupView {
    return {
      id: g.id,
      name: g.name,
      stage: g.stage,
      teamScore: this.teamScore(s, g),
      teamBonusAwarded: g.teamBonusAwarded,
      paused: g.paused,
      status: g.status,
      thinking: g.thinking,
      stalled: g.stalled,
      summary: g.summary,
      members: g.memberIds
        .map((id) => s.participants.get(id)!)
        .filter((p) => p && !p.removed)
        .map((p) => ({ id: p.id, nickname: p.nickname, points: this.points(s, p.id), left: p.left, connected: p.connected, isSim: p.isSim })),
    };
  }

  buildScoreboard(s: Session): Scoreboard {
    const teams = s.groups
      .map((g) => ({
        groupId: g.id,
        name: g.name,
        teamScore: this.teamScore(s, g),
        summary: g.summary ?? buildGroupSummary(s.pack, g.ideas),
        rank: 0,
        members: g.memberIds
          .map((id) => s.participants.get(id)!)
          .filter((p) => p && !p.removed)
          .map((p) => {
            const byB: Partial<Record<Behaviour, number>> = {};
            s.scoreEvents.filter((e) => e.participantId === p.id).forEach((e) => (byB[e.behaviour] = (byB[e.behaviour] ?? 0) + (e.override?.points ?? e.points)));
            return { id: p.id, nickname: p.nickname, points: this.points(s, p.id), badge: pickBadge(byB), left: p.left };
          }),
      }))
      .sort((a, b) => b.teamScore - a.teamScore);
    teams.forEach((t, i) => (t.rank = i > 0 && t.teamScore === teams[i - 1].teamScore ? teams[i - 1].rank : i + 1));
    const board: Scoreboard = { teams };
    if (s.showIndividual) {
      const all = teams.flatMap((t) => t.members).sort((a, b) => b.points - a.points);
      board.individual = all.map((m, i) => ({ nickname: m.nickname, points: m.points, rank: i + 1 }));
    }
    return board;
  }

  studentState(participantId: string): StudentState | undefined {
    const p = this.participantIndex.get(participantId);
    if (!p) return undefined;
    const s = this.sessions.get(p.sessionId);
    if (!s) return undefined;
    const g = p.groupId ? this.groupIndex.get(p.groupId) : undefined;
    const messages = (g?.messages ?? [])
      .filter((m) => (m.status === 'shown' && (!m.privateTo || m.privateTo === p.id)) || (m.participantId === p.id && m.status !== 'shown'))
      .slice(-150)
      // FR-025 / Constitution 9: move reasons and moderation flags are teacher-only.
      .map(({ reason: _r, flag: _f, ...m }) => m);
    const awards = s.scoreEvents.filter((e) => e.participantId === p.id || (e.participantId === null && e.groupId === p.groupId));
    let warning: string | undefined;
    if (s.status === 'running' && s.warned) warning = '2 minutes left';
    return {
      sessionStatus: s.status,
      packTitle: s.pack.title,
      me: { id: p.id, nickname: p.nickname, points: this.points(s, p.id), left: p.left },
      group: g ? this.groupView(s, g) : undefined,
      messages,
      awards,
      endsAt: s.endsAt,
      warning,
      scoreboard: s.status === 'ended' ? s.scoreboard : undefined,
      waitingCount: [...s.participants.values()].filter((x) => !x.removed).length,
    };
  }

  teacherState(sessionId: string): TeacherState {
    const s = this.mustSession(sessionId);
    const pv = (p: Participant): TeacherParticipantView => ({
      id: p.id,
      nickname: p.nickname,
      points: this.points(s, p.id),
      left: p.left,
      connected: p.connected,
      isSim: p.isSim,
      groupId: p.groupId,
      state: p.state,
      stateConfidence: p.stateConfidence,
      messageCount: p.messageCount,
    });
    const participants = [...s.participants.values()].filter((p) => !p.removed);
    const groups: TeacherGroupView[] = s.groups.map((g) => ({ ...this.groupView(s, g), messages: g.messages.slice(-200) }));
    const ai = this.deps.ai;
    return {
      sessionId: s.id,
      code: s.code,
      status: s.status,
      locked: s.locked,
      pack: summarizePack(s.pack),
      groupSize: s.groupSize,
      durationMin: s.durationMs / 60_000,
      showIndividualRankings: s.showIndividual,
      startedAt: s.startedAt,
      endsAt: s.endsAt,
      waiting: s.status === 'waiting' ? participants.map(pv) : [],
      participants: participants.map(pv),
      groups,
      alerts: [...s.alerts].reverse(),
      scoreEvents: s.scoreEvents,
      scoreboard: s.status === 'ended' ? s.scoreboard : undefined,
      aiProvider: ai.name,
      aiCost: {
        ...s.aiCost,
        estimatedUsd: (s.aiCost.promptTokens * ai.usdPerMTokIn + s.aiCost.outputTokens * ai.usdPerMTokOut) / 1_000_000,
      },
      warnings: s.warnings,
    };
  }

  auditLog(sessionId: string) {
    return this.mustSession(sessionId).audit;
  }

  // ---------------- helpers ----------------

  activeMembers(g: Group): Participant[] {
    return g.memberIds.map((id) => this.participantIndex.get(id)!).filter((p) => p && !p.removed && !p.left);
  }

  groupOf(participantId: string) {
    const p = this.participantIndex.get(participantId);
    return p?.groupId ? this.groupIndex.get(p.groupId) : undefined;
  }

  private postSystem(g: Group, text: string) {
    g.messages.push({ id: newId('m'), groupId: g.id, sender: 'system', text, ts: this.now(), status: 'shown' });
  }

  private alert(s: Session, a: Omit<Alert, 'id' | 'sessionId' | 'ts' | 'acknowledged'>) {
    s.alerts.push({ ...a, id: newId('a'), sessionId: s.id, ts: this.now(), acknowledged: false });
  }

  private log(s: Session, e: Omit<AuditEntry, 'ts' | 'rubricVersion'>) {
    s.audit.push({ ...e, ts: this.now(), rubricVersion: RUBRIC_VERSION }); // NFR-014
  }

  private changed(s: Session) {
    this.deps.events.sessionChanged(s.id);
  }

  private mustSession(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error('Session not found.');
    return s;
  }

  private mustGroup(s: Session, id: string): Group {
    const g = s.groups.find((x) => x.id === id);
    if (!g) throw new Error('Group not found.');
    return g;
  }

  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(label)), ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}

export type { Session, Group, Participant };
export const STAGE_ORDER = STAGES;
export type { MoveType };
