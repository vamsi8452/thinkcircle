import type { ConceptPack } from '../../shared/types.js';
import { hasCausal, hasEvidence, isOnTopic, matchesGroups, norm, wordCount } from './text.js';

/** Everything we read off one student message. Text only: no faces, no voice (Constitution 5, FR-021). */
export interface MessageSignals {
  answerRequest: boolean;
  confusion: boolean;
  frustration: boolean;
  nonEnglish: boolean;
  longPaste: boolean;
  onTopic: boolean;
  causal: boolean;
  evidence: boolean;
  question: boolean;
  keyIdeas: string[];
  misconceptions: string[];
  words: number;
}

const ANSWER_REQUEST =
  /\b((just )?(tell|give|show) (me|us) (the )?(answer|solution)|what('?s| is) the (right |correct |real )?answer|just (say|tell) (it|us|me)|(can|could) you (just )?(tell|give) (me|us) (the )?answer|give us the answer|tell us already)\b/;
const CONFUSION =
  /\b(i (don'?t|dont|do not) (get|understand|know)|idk|confus(ed|ing)|what do you mean|huh|i'?m lost|im lost|not sure|no idea|i'?m stuck|makes no sense)\b/;
const FRUSTRATION =
  /\b(ugh+|argh+|this is (stupid|dumb|boring|pointless|too hard|annoying)|i give up|too hard|i hate this|so annoying|why do we (even )?have to|forget it|this sucks|whatever)\b/;

const EN_STOP = /\b(the|is|it|and|because|i|you|that|what|so|a|to|of|think|it's|are|this|why)\b/g;
const FOREIGN_STOP =
  /\b(el|la|los|las|que|porque|es|est|une|des|les|pourquoi|parce|je|tu|nous|não|por|para|ich|und|nicht|ist|der|die|das|kya|hai|nahi|aur)\b/g;

export function detectNonEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length >= 4) {
    const nonLatin = letters.filter((c) => !/[a-zA-ZÀ-ÿ]/.test(c)).length;
    if (nonLatin / letters.length > 0.4) return true;
  }
  const t = norm(text);
  const en = (t.match(EN_STOP) ?? []).length;
  const foreign = (t.match(FOREIGN_STOP) ?? []).length;
  return foreign >= 2 && en === 0;
}

function isShouting(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length >= 6 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.75;
}

export function readSignals(text: string, pack: ConceptPack): MessageSignals {
  const t = norm(text);
  const keyIdeas = pack.keyIdeas.filter((k) => matchesGroups(t, k.keywords)).map((k) => k.id);
  const misconceptions = pack.misconceptions.filter((m) => matchesGroups(t, m.keywords)).map((m) => m.id);
  return {
    answerRequest: ANSWER_REQUEST.test(t),
    confusion: CONFUSION.test(t) || /^\?+$/.test(t),
    frustration: FRUSTRATION.test(t) || /!{3,}/.test(t) || isShouting(text),
    nonEnglish: detectNonEnglish(text),
    longPaste: text.trim().length >= 280,
    onTopic: keyIdeas.length > 0 || isOnTopic(t, pack.topicKeywords),
    causal: hasCausal(t),
    evidence: hasEvidence(t),
    question: t.includes('?'),
    keyIdeas,
    misconceptions,
    words: wordCount(t),
  };
}
