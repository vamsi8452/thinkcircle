import type { Behaviour, ConceptPack, MoveType, Stage } from '../../shared/types.js';
import { STAGES } from '../../shared/types.js';
import type { Decision } from './facilitator.js';
import { moderateText } from './moderation.js';
import { norm, pick, snippet, words } from './text.js';

export interface ComposeCtx {
  pack: ConceptPack;
  /** Stage the message is for (the new stage when advancing). */
  stage: Stage;
  nick: (id?: string) => string;
  allNicks: string[];
  hintLevel: number;
  turn: number;
  lastSpeakerNick?: string;
}

export function nextStage(s: Stage): Stage {
  const i = STAGES.indexOf(s);
  return STAGES[Math.min(i + 1, STAGES.length - 1)];
}

function lowerFirst(s: string): string {
  return /^(I\b|I')/.test(s) ? s : s[0].toLowerCase() + s.slice(1);
}

function q(ctx: ComposeCtx, offset = 0): string {
  const qs = ctx.pack.stages[ctx.stage].questions;
  return pick(qs, ctx.turn + offset);
}

/** Deterministic facilitator text built from the concept pack (FR-011). Also the fallback for LLM output. */
export function composeRules(d: Decision, ctx: ComposeCtx): string {
  const t = ctx.nick(d.targetId);
  const p = ctx.nick(d.peerId);
  const seed = ctx.turn;
  const pack = ctx.pack;

  switch (d.move) {
    case 'open':
      return `Welcome, ${ctx.allNicks.join(', ')}! Let's think this through together. ${pack.stages[ctx.stage].questions[0]}`;
    case 'probe':
      if (!d.targetId) return q(ctx);
      return pick(
        [
          `${t}, what makes you think "${snippet(d.refText ?? '')}"?`,
          `${t}, interesting! Can you say more about why you think that?`,
          `${t}, how could we check whether that's true?`,
          `${t}, good thinking. ${q(ctx, 1)}`,
          `${t}, what would have to be different for that not to happen?`,
        ],
        seed,
      );
    case 'connect':
      if (d.style === 'peer-explain') {
        return `${p}, could you explain your idea to ${t} in a different way? ${t}, what part would you like ${p} to explain?`;
      }
      return pick(
        [
          `${t}, ${p} said "${snippet(d.refText ?? '')}". How does that fit with your idea?`,
          `${t}, do you agree or disagree with ${p}'s idea? Why?`,
          `${t} and ${p}, you both have ideas going. What do they have in common?`,
        ],
        seed,
      );
    case 'hint':
      if (d.style === 'analogy') return `${t}, let's try it another way. ${pick(pack.analogies, seed)}`;
      return `${t}, I won't give it away, but here's a smaller step: ${pack.hints[Math.min(ctx.hintLevel, pack.hints.length - 1)]}`;
    case 'invite':
      if (d.style === 'first-voice') {
        return pick(
          [`${t}, we haven't heard your thinking yet. Which idea so far sounds most likely to you?`, `${t}, what's your hunch? There's no wrong answer here.`],
          seed,
        );
      }
      return pick(
        [
          `${t}, what's your hunch? There's no wrong answer here.`,
          ctx.lastSpeakerNick && ctx.lastSpeakerNick !== t
            ? `${t}, do you agree or disagree with ${ctx.lastSpeakerNick}? Why?`
            : `${t}, what do you think? ${q(ctx, 1)}`,
          `${t}, here's one for you: ${pick(pack.easierQuestions, seed)}`,
        ],
        seed,
      );
    case 'challenge':
      if (d.style === 'help-peer') return `${t}, you're on a roll! Could you ask ${p} a question that helps them think it through?`;
      if (d.style === 'misconception') {
        const m = pack.misconceptions.find((x) => x.id === d.misconceptionId);
        return `${t}, ${lowerFirst(m ? m.probe : q(ctx))}`;
      }
      return `${t}, nice thinking! Here's a harder one: ${pick(pack.harderQuestions, seed)}`;
    case 'support':
      return `${t}, you're working hard on this, and that's how learning happens. Let's try an easier one: ${pick(pack.easierQuestions, seed)}`;
    case 'redirect':
      return `${t}, I'm here to help with one thing today: ${pack.title.replace(/\?$/, '').toLowerCase()}. ${q(ctx)}`;
    case 'language':
      return `${t}, I'll reply in English. Could you share your idea in English so the whole group can follow? ${q(ctx)}`;
    case 'own-words':
      return `${t}, that's a detailed answer! Can you explain the main idea in your own words, in one or two sentences?`;
    case 'advance':
      return `Great thinking, everyone. You're ready for the next challenge. ${pack.stages[ctx.stage].questions[0]}`;
    case 'regroup':
      return `Let's try an easier one together: ${pick(pack.easierQuestions, seed)} Anyone can start!`;
    case 'fallback':
      return pick(pack.fallbackQuestions, seed);
    case 'distress':
      return `${t}, thank you for telling us. That sounds really hard, and you deserve support. I've let your teacher know so they can check in with you.`;
    case 'summary':
      return '';
  }
}

// ---------- Guard (FR-012, FR-040, NFR-013) ----------

const STOP = new Set('the a an of to and is it its it’s that this in on for as be by with are was so than their they can from them when while over into what why how does do you your'.split(' '));
function contentWords(s: string): Set<string> {
  return new Set(words(s).filter((w) => w.length > 2 && !STOP.has(w)));
}

/** True if the AI text states the target answer (pattern match or heavy overlap with it in one sentence). */
export function leaksAnswer(text: string, pack: ConceptPack): boolean {
  const t = norm(text);
  if (pack.answerLeakPatterns.some((p) => new RegExp(p).test(t))) return true;
  const target = contentWords(pack.targetAnswer);
  for (const sentence of t.split(/[.!?]+/)) {
    const cw = contentWords(sentence);
    if (cw.size < 5) continue;
    let hit = 0;
    cw.forEach((w) => target.has(w) && hit++);
    if (hit / cw.size >= 0.7 && hit >= 7) return true;
  }
  return false;
}

/** Rough Flesch–Kincaid grade, for NFR-013 monitoring. */
export function readingGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const w = words(text);
  if (w.length === 0) return 0;
  const syll = w.reduce((a, word) => a + Math.max(1, (word.replace(/e$/, '').match(/[aeiouy]+/g) ?? []).length), 0);
  return 0.39 * (w.length / sentences) + 11.8 * (syll / w.length) - 15.59;
}

export interface GuardResult {
  ok: boolean;
  problems: string[];
}

const NO_QUESTION_MOVES: MoveType[] = ['distress', 'summary'];

export function checkAiMessage(text: string, pack: ConceptPack, move: MoveType): GuardResult {
  const problems: string[] = [];
  if (!text.trim()) problems.push('empty');
  if (move !== 'summary' && leaksAnswer(text, pack)) problems.push('states the target answer');
  const mod = moderateText(text);
  if (mod.action !== 'allow') problems.push(`moderation: ${mod.reason}`);
  if (!NO_QUESTION_MOVES.includes(move) && !text.includes('?')) problems.push('not phrased as a question');
  if (words(text).length > 70) problems.push('too long');
  return { ok: problems.length === 0, problems };
}

// ---------- Summary & badges (FR-015, FR-035) ----------

export function buildGroupSummary(pack: ConceptPack, ideas: Map<string, string[]>): string {
  const reached = pack.keyIdeas.filter((k) => (ideas.get(k.id) ?? []).length > 0);
  if (reached.length === 0) {
    return `Your group explored lots of ideas about "${pack.title}" Keep wondering about it, and test your ideas at home!`;
  }
  const lines = reached.map((k) => {
    const who = [...new Set(ideas.get(k.id))].slice(0, 3).join(', ');
    return `• ${k.text[0].toUpperCase()}${k.text.slice(1)} (${who})`;
  });
  return `Here's what your group figured out together:\n${lines.join('\n')}`;
}

const BADGES: Record<Behaviour, string> = {
  reasoning: 'Deep Reasoner',
  'build-on-peer': 'Bridge Builder',
  'good-question': 'Question Quester',
  'changed-mind': 'Open Mind',
  'explain-to-peer': 'Peer Teacher',
  'first-contribution': 'Voice Starter',
  'team-bonus': 'Team Player',
};

export function pickBadge(pointsByBehaviour: Partial<Record<Behaviour, number>>): string {
  // Rarer behaviours win ties so badges spread across the group.
  const order: Behaviour[] = ['explain-to-peer', 'changed-mind', 'good-question', 'build-on-peer', 'reasoning', 'first-contribution'];
  let best: Behaviour | null = null;
  for (const b of order) {
    const v = pointsByBehaviour[b] ?? 0;
    if (v > 0 && (best === null || v > (pointsByBehaviour[best] ?? 0))) best = b;
  }
  return best ? BADGES[best] : 'Curious Mind';
}
