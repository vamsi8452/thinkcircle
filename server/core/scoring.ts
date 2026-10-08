import type { Behaviour } from '../../shared/types.js';
import type { MessageSignals } from './signals.js';
import { norm, truncateWords } from './text.js';

// Rubric (FR-030). Values pending teacher-advisor review (Spec §8).
export const RUBRIC = {
  reasoningMax: 3,
  buildOnPeer: 2,
  goodQuestion: 2,
  changedMind: 2,
  explainToPeer: 3,
  firstContribution: 1,
  stageCap: 8, // FR-033
  teamBonus: 5, // FR-034
} as const;

export interface Award {
  behaviour: Behaviour;
  points: number;
  reason: string;
}

export interface ScoreInput {
  text: string;
  signals: MessageSignals;
  isFirstContribution: boolean;
  /** Other members of the group (not the sender). */
  peers: string[];
  /** Nickname of the most recent other student who spoke, for "I agree with that" without a name. */
  lastOtherSpeaker?: string;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mentionedPeer(text: string, peers: string[]): string | undefined {
  const t = norm(text);
  return peers.find((p) => new RegExp(`(^|[^a-z0-9])@?${escapeRe(p.toLowerCase())}($|[^a-z0-9])`).test(t));
}

const BUILD_ON = /\b(agree with|building on|build on|adding to|add on to|to add (on|to)|like \w+ said|as \w+ said|what \w+ said|\w+'s idea|disagree with|i think \w+ is right|same as \w+|but also)\b/;
const CHANGED_MIND = /\b(changed my mind|change my mind|i was wrong|now i think|i used to think|actually i think|i take that back|on second thought|i think differently now)\b/;
const QUESTION_WORD = /\b(why|how|what if|what would|what happens|what about|could|would|does|do you think|is it|isn'?t it|wouldn'?t)\b/;

const reason = (s: string) => truncateWords(s, 12); // FR-031

/**
 * Score one message against the rubric (FR-030). Deliberately takes no timing or ordering input
 * across students, so speed and "being first" can never earn points (Constitution 2, FR-032).
 */
export function scoreMessage(i: ScoreInput): Award[] {
  const s = i.signals;
  const awards: Award[] = [];
  const substantive = s.words >= 4 && !s.nonEnglish;

  if (i.isFirstContribution) {
    awards.push({ behaviour: 'first-contribution', points: RUBRIC.firstContribution, reason: reason('Shared your first idea with the group') });
  }
  if (!substantive) return awards;

  // Reasoning 0–3
  if (s.onTopic) {
    const parts: string[] = [];
    if (s.causal) parts.push('gave a reason');
    if (s.keyIdeas.length > 0) parts.push('used a key idea');
    if (s.evidence || s.keyIdeas.length >= 2) parts.push(s.evidence ? 'backed it with an example' : 'linked two ideas');
    const pts = Math.min(RUBRIC.reasoningMax, parts.length);
    if (pts > 0) {
      const text = parts.join(', ');
      awards.push({ behaviour: 'reasoning', points: pts, reason: reason(text[0].toUpperCase() + text.slice(1)) });
    }
  }

  const peer = mentionedPeer(i.text, i.peers);
  const explains = peer && s.causal && s.keyIdeas.length > 0 && !s.question;
  if (explains) {
    awards.push({ behaviour: 'explain-to-peer', points: RUBRIC.explainToPeer, reason: reason(`Explained your thinking to ${peer}`) });
  } else if (s.onTopic && (peer || BUILD_ON.test(norm(i.text)))) {
    const who = peer ?? i.lastOtherSpeaker;
    if (who) {
      awards.push({ behaviour: 'build-on-peer', points: RUBRIC.buildOnPeer, reason: reason(`Built on ${who}'s idea`) });
    }
  }

  if (s.question && s.onTopic && !s.answerRequest && !s.confusion && s.words >= 5 && QUESTION_WORD.test(norm(i.text))) {
    awards.push({ behaviour: 'good-question', points: RUBRIC.goodQuestion, reason: reason("Asked a question that pushes the group's thinking") });
  }

  if (CHANGED_MIND.test(norm(i.text)) && (s.causal || s.evidence)) {
    awards.push({ behaviour: 'changed-mind', points: RUBRIC.changedMind, reason: reason('Changed your mind using evidence, like a real scientist') });
  }

  return awards;
}

/** Trim awards so a student never exceeds the per-stage cap (FR-033). No penalty is shown. */
export function applyStageCap(awards: Award[], earnedThisStage: number, cap: number = RUBRIC.stageCap): Award[] {
  let room = Math.max(0, cap - earnedThisStage);
  const out: Award[] = [];
  for (const a of awards) {
    if (room <= 0) break;
    const pts = Math.min(a.points, room);
    room -= pts;
    out.push({ ...a, points: pts });
  }
  return out;
}

export const TEAM_BONUS_REASON = 'Every voice heard: all-voices team bonus!';
