import type { EngagementState } from '../../shared/types.js';
import type { MessageSignals } from './signals.js';

export const SILENCE_INVITE_MS = 60_000; // FR-022
export const CLASSIFY_SILENCE_EVERY_MS = 20_000; // FR-020

export interface EngagementInput {
  now: number;
  /** Most recent first. */
  recent: { ts: number; signals: MessageSignals; scoredReasoning: number }[];
  messageCount: number;
  groupAvgCount: number;
  activeMembers: number;
  /** Time since this student last spoke (or joined the group if they never have). */
  silentMs: number;
}

export interface EngagementResult {
  state: EngagementState;
  confidence: number;
  reason: string;
}

/** FR-020/021: classify from message text, timing and counts only. Never shown to students (FR-025). */
export function classifyEngagement(i: EngagementInput): EngagementResult {
  const last = i.recent[0];
  const lastIsFresh = last && i.now - last.ts < 90_000;

  if (lastIsFresh && last.signals.frustration) {
    return { state: 'frustrated', confidence: 0.8, reason: 'Recent message shows frustration words or tone' };
  }
  if (lastIsFresh && (last.signals.confusion || (last.signals.answerRequest && last.scoredReasoning === 0))) {
    return { state: 'confused', confidence: 0.75, reason: 'Recent message signals confusion' };
  }
  if (i.activeMembers >= 2 && i.messageCount >= 4 && i.messageCount > 2 * i.groupAvgCount) {
    return {
      state: 'dominating',
      confidence: 0.7,
      reason: `Sent ${i.messageCount} messages vs group average ${i.groupAvgCount.toFixed(1)}`,
    };
  }
  const streak = i.recent.slice(0, 3);
  if (
    streak.length >= 2 &&
    streak.slice(0, 2).every((m) => m.scoredReasoning >= 2 && m.signals.keyIdeas.length > 0) &&
    streak[0].ts - streak[1].ts < 60_000
  ) {
    return { state: 'ahead', confidence: 0.7, reason: 'Several quick, well-reasoned answers in a row' };
  }
  if (i.silentMs >= SILENCE_INVITE_MS) {
    return { state: 'disengaged', confidence: 0.6, reason: `Silent for ${Math.round(i.silentMs / 1000)}s` };
  }
  if (streak.length >= 2 && streak.slice(0, 2).every((m) => m.signals.words <= 2 && !m.signals.onTopic)) {
    return { state: 'disengaged', confidence: 0.5, reason: 'Short, off-topic replies' };
  }
  return { state: 'engaged', confidence: 0.6, reason: 'Contributing on topic' };
}
