import type { EngagementState, MoveType, Stage } from '../../shared/types.js';
import type { ModResult } from './moderation.js';
import type { MessageSignals } from './signals.js';
import { SILENCE_INVITE_MS } from './engagement.js';

export const ADVANCE_THRESHOLD = 0.6; // FR-013
/** Minimum share of a stage's time limit before an understanding-based advance, so discussion has room to happen. */
export const MIN_DWELL_SHARE = 0.3;
export const NEGLECT_MS = 150_000; // keeps everyone addressed within 3 minutes (SC-003)
export const STALL_MS = 120_000; // edge case: whole group silent for 2 minutes

export interface MemberCtx {
  id: string;
  nickname: string;
  messageCount: number;
  /** Last time they spoke, or when they joined the group if they never have. */
  lastSpokeAt: number;
  lastAddressedAt: number | null;
  state: EngagementState;
  understoodStage: boolean;
}

export interface BatchItem {
  participantId: string;
  text: string;
  signals: MessageSignals;
  mod: ModResult;
}

export interface DecideInput {
  trigger: 'start' | 'messages' | 'tick';
  now: number;
  stage: Stage;
  stageElapsedMs: number;
  stageLimitMs: number;
  groupStartedAt: number;
  members: MemberCtx[];
  batch: BatchItem[];
  /** Targets of previous AI turns, oldest first (null = whole group). */
  recentTargets: (string | null)[];
  lastAiAt: number;
  lastStudentMsgAt: number;
  /** Group already flagged as stalled since the last student message. */
  stalled?: boolean;
  /** Last other-student message, for "connect" moves. */
  lastOtherMessage?: { participantId: string; text: string };
}

export interface Decision {
  move: MoveType;
  targetId?: string;
  peerId?: string;
  style?: 'peer-explain' | 'analogy' | 'harder' | 'help-peer' | 'misconception' | 'link' | 'first-voice';
  misconceptionId?: string;
  refText?: string;
  advance?: boolean;
  complete?: boolean;
  stalled?: boolean;
  reason: string;
}

export function dominantIds(members: MemberCtx[]): Set<string> {
  if (members.length < 2) return new Set();
  const avg = members.reduce((a, m) => a + m.messageCount, 0) / members.length;
  return new Set(members.filter((m) => m.messageCount >= 4 && m.messageCount > 2 * avg).map((m) => m.id));
}

/** FR-024: not the same student more than 2 consecutive turns when others are present. */
function overAddressed(id: string, recent: (string | null)[], memberCount: number): boolean {
  if (memberCount < 2) return false;
  const last2 = recent.slice(-2);
  return last2.length === 2 && last2.every((t) => t === id);
}

function leastRecentlyAddressed(cands: MemberCtx[]): MemberCtx | undefined {
  return [...cands].sort((a, b) => (a.lastAddressedAt ?? -1) - (b.lastAddressedAt ?? -1))[0];
}

/** FR-023: choose the next move and who it's for, from the group's state. Pure function. */
export function decideMove(i: DecideInput): Decision | null {
  const active = i.members;
  if (active.length === 0) return null;
  const dominant = dominantIds(active);
  const canTarget = (m: MemberCtx) => !dominant.has(m.id) && !overAddressed(m.id, i.recentTargets, active.length);
  const byId = new Map(active.map((m) => [m.id, m]));
  const understoodFrac = active.filter((m) => m.understoodStage).length / active.length;
  const timeUp = i.stageElapsedMs >= i.stageLimitMs;
  const dwelt = i.stageElapsedMs >= i.stageLimitMs * MIN_DWELL_SHARE;

  if (i.trigger === 'start') return { move: 'open', reason: 'Session start: opening question from the pack' };

  const stageMove = (): Decision | null => {
    if (i.stage === 'consolidate') {
      if ((active.every((m) => m.understoodStage) && dwelt) || timeUp) {
        return { move: 'summary', complete: true, reason: timeUp ? 'Consolidate time limit reached' : 'Every student explained the idea in their own words' };
      }
      return null;
    }
    if (understoodFrac >= ADVANCE_THRESHOLD && dwelt) {
      return { move: 'advance', advance: true, reason: `${Math.round(understoodFrac * 100)}% of the group showed understanding (≥60%)` };
    }
    if (timeUp) return { move: 'advance', advance: true, reason: 'Stage time limit reached' };
    return null;
  };

  const silentMember = () =>
    active
      .filter((m) => i.now - m.lastSpokeAt >= SILENCE_INVITE_MS && canTarget(m))
      .filter((m) => m.lastAddressedAt === null || i.now - m.lastAddressedAt >= SILENCE_INVITE_MS / 2)
      .sort((a, b) => a.lastSpokeAt - b.lastSpokeAt)[0];

  const neglected = () =>
    active
      .filter((m) => i.now - (m.lastAddressedAt ?? i.groupStartedAt) >= NEGLECT_MS && canTarget(m))
      .sort((a, b) => (a.lastAddressedAt ?? 0) - (b.lastAddressedAt ?? 0))[0];

  if (i.trigger === 'tick') {
    if (i.now - i.lastStudentMsgAt >= STALL_MS && (!i.stalled || i.now - i.lastAiAt >= 60_000) && i.now - i.lastAiAt >= 15_000) {
      return { move: 'regroup', stalled: true, reason: 'Whole group silent for 2 minutes: easier open question' };
    }
    if (i.now - i.lastAiAt < 15_000 && !timeUp) return null;
    const sm = stageMove();
    if (sm) return sm;
    const s = silentMember();
    if (s) return { move: 'invite', targetId: s.id, style: s.messageCount === 0 ? 'first-voice' : undefined, reason: `${s.nickname} silent for ${Math.round((i.now - s.lastSpokeAt) / 1000)}s` };
    const n = neglected();
    if (n) return { move: 'invite', targetId: n.id, reason: `${n.nickname} not addressed for over 2.5 minutes` };
    return null;
  }

  // trigger === 'messages'
  const b = i.batch;
  const ask = b.find((x) => x.signals.answerRequest);
  if (ask) return { move: 'hint', targetId: ask.participantId, refText: ask.text, reason: 'Student asked for the answer: smaller hint as a question (FR-014)' };

  const offTopic = b.find((x) => x.mod.category === 'injection' || x.mod.category === 'off-topic');
  if (offTopic) return { move: 'redirect', targetId: offTopic.participantId, refText: offTopic.text, reason: `${offTopic.mod.reason}: returning to topic (FR-043)` };

  const lang = b.find((x) => x.signals.nonEnglish);
  if (lang) return { move: 'language', targetId: lang.participantId, refText: lang.text, reason: 'Message not in English: reply in English and ask for English' };

  const sm = stageMove();
  if (sm) return sm;

  const frus = b.find((x) => x.signals.frustration);
  if (frus) return { move: 'support', targetId: frus.participantId, refText: frus.text, reason: 'Frustration signals: acknowledge effort, easier question' };

  const silent = silentMember();
  if (silent) return { move: 'invite', targetId: silent.id, style: silent.messageCount === 0 ? 'first-voice' : undefined, reason: `${silent.nickname} silent for ${Math.round((i.now - silent.lastSpokeAt) / 1000)}s` };

  const n0 = neglected();
  if (n0 && !b.some((x) => x.signals.confusion && x.participantId !== n0.id)) {
    return { move: 'invite', targetId: n0.id, reason: `${n0.nickname} not addressed for over 2.5 minutes` };
  }

  const conf = b.find((x) => x.signals.confusion);
  if (conf) {
    const helper = active.find((m) => m.id !== conf.participantId && m.understoodStage && !dominant.has(m.id));
    if (helper) {
      return { move: 'connect', style: 'peer-explain', targetId: conf.participantId, peerId: helper.id, reason: `Confusion signals: asking ${helper.nickname} to explain to a peer` };
    }
    return { move: 'hint', style: 'analogy', targetId: conf.participantId, refText: conf.text, reason: 'Confusion signals: smaller step via analogy' };
  }

  const paste = b.find((x) => x.signals.longPaste);
  if (paste) return { move: 'own-words', targetId: paste.participantId, refText: paste.text, reason: 'Long, polished answer: ask to explain in own words' };

  const aheadItem = b.find((x) => byId.get(x.participantId)?.state === 'ahead' && canTarget(byId.get(x.participantId)!));
  if (aheadItem) {
    const struggling = active.find((m) => m.id !== aheadItem.participantId && !m.understoodStage);
    const lastWasHelp = i.recentTargets.length > 0 && i.recentTargets[i.recentTargets.length - 1] === aheadItem.participantId;
    if (struggling && i.stage !== 'consolidate' && !lastWasHelp) {
      return { move: 'challenge', style: 'help-peer', targetId: aheadItem.participantId, peerId: struggling.id, reason: 'Student ahead: ask them to help a peer' };
    }
    return { move: 'challenge', style: 'harder', targetId: aheadItem.participantId, reason: 'Student ahead: harder "what if" question' };
  }

  const mis = b.find((x) => x.signals.misconceptions.length > 0 && canTarget(byId.get(x.participantId) ?? ({} as MemberCtx)));
  if (mis) {
    return { move: 'challenge', style: 'misconception', targetId: mis.participantId, misconceptionId: mis.signals.misconceptions[0], refText: mis.text, reason: `Common misconception spotted: ${mis.signals.misconceptions[0]}` };
  }

  const n = neglected();
  if (n) return { move: 'invite', targetId: n.id, reason: `${n.nickname} not addressed for over 2.5 minutes` };

  const senders = b.map((x) => byId.get(x.participantId)).filter((m): m is MemberCtx => !!m && canTarget(m));
  const target = leastRecentlyAddressed(senders);
  if (target) {
    const item = b.find((x) => x.participantId === target.id)!;
    const other = b.find((x) => x.participantId !== target.id) ?? (i.lastOtherMessage && i.lastOtherMessage.participantId !== target.id ? i.lastOtherMessage : undefined);
    if (other && byId.has(other.participantId) && item.signals.onTopic) {
      return { move: 'connect', style: 'link', targetId: target.id, peerId: other.participantId, refText: other.text, reason: `Connecting ${target.nickname}'s idea to a peer's` };
    }
    return { move: 'probe', targetId: target.id, refText: item.text, reason: `Probing ${target.nickname}'s reasoning` };
  }

  // Only dominant/over-addressed students spoke: turn to someone else (FR-024, US-3).
  const others = active.filter((m) => canTarget(m) && !b.some((x) => x.participantId === m.id));
  const alt = leastRecentlyAddressed(others);
  if (alt) return { move: 'invite', targetId: alt.id, reason: `Balancing participation: inviting ${alt.nickname} instead of the most active student` };
  return { move: 'probe', reason: 'Probing the whole group' };
}
