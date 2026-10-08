// Small text helpers shared by moderation, scoring, engagement and the facilitator.

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const phraseCache = new Map<string, RegExp>();

/** True if `phrase` appears in `text` starting at a word boundary (so "dens" matches "density"). */
export function hasPhrase(text: string, phrase: string): boolean {
  let re = phraseCache.get(phrase);
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9])${escapeRe(phrase.toLowerCase())}`);
    phraseCache.set(phrase, re);
  }
  return re.test(norm(text));
}

export function hasAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => hasPhrase(text, p));
}

/** AND of ORs: every group needs at least one phrase present. */
export function matchesGroups(text: string, groups: string[][]): boolean {
  return groups.length > 0 && groups.every((g) => hasAny(text, g));
}

export function words(text: string): string[] {
  return norm(text)
    .replace(/[^a-z0-9' ]/g, ' ')
    .split(' ')
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return words(text).length;
}

const CAUSAL = /\b(because|cuz|cause|since|so that|so it|so the|so they|so there|so its|so it's|which means|that means|this means|therefore|due to|that's why|thats why|this is why|which is why|which makes|makes it)\b|\bif\b.+\b(then|would|will)\b/;
export function hasCausal(text: string): boolean {
  return CAUSAL.test(norm(text));
}

const EVIDENCE = /\b(for example|for instance|like when|i saw|i've seen|ive seen|we could test|test it|experiment|when you|one time|at home|in the bath|in the sink|\d+)\b/;
export function hasEvidence(text: string): boolean {
  return EVIDENCE.test(norm(text));
}

export function isOnTopic(text: string, topicKeywords: string[]): boolean {
  return hasAny(text, topicKeywords);
}

export function truncateWords(text: string, max: number): string {
  const w = text.trim().split(/\s+/);
  return w.length <= max ? text.trim() : w.slice(0, max).join(' ');
}

export function snippet(text: string, maxWords = 8): string {
  const w = text.trim().replace(/[.!?]+$/, '').split(/\s+/);
  return w.length <= maxWords ? w.join(' ') : `${w.slice(0, maxWords).join(' ')}…`;
}

export function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
