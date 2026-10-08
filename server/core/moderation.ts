import { norm } from './text.js';

// Local, rule-based moderation (FR-040–043). Deterministic and fast, so it never blocks the chat.
// A hosted classifier can be added behind the Moderator interface; this layer stays as the floor.

export type ModCategory = 'distress' | 'personal-info' | 'bullying' | 'profanity' | 'injection' | 'off-topic';

export interface ModResult {
  /** allow: show it. hide: hide from group + gentle reminder + alert. urgent: hide + urgent alert + supportive reply. */
  action: 'allow' | 'hide' | 'urgent';
  category?: ModCategory;
  reason: string;
  alertLevel?: 'info' | 'warning' | 'urgent';
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

function deobfuscate(s: string): string {
  return norm(s)
    .replace(/[01345@$7]/g, (c) => LEET[c] ?? c)
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/(?<=\b[a-z])[.*_-](?=[a-z]\b)/g, '');
}

const DISTRESS = [
  /\b(kill|hurt|cut|harm) (my ?self|myself)\b/,
  /\bwant(ed)? to (die|disappear|end it)\b/,
  /\b(suicide|suicidal|self[- ]?harm)\b/,
  /\bno ?one (cares|would care|loves me)\b|\bnobody (cares|loves me)\b/,
  /\bi hate my life\b|\bi wish i (was|were) dead\b/,
  /\b(not|don'?t feel) safe (at home|at school|anymore)\b/,
  /\bscared to go home\b/,
  /\b(he|she|they|my (dad|mom|mum|step\w*|brother|uncle)) (hits|hurts|beats|touches) me\b/,
  /\bsomeone (is )?(hurting|touching) me\b/,
  /\bi('?m| am) being (bullied|hurt|abused)\b/,
];

const PII = [
  /(\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/, // phone
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/, // email
  /\b[abceghjklmnprstvxy]\d[abceghjklmnprstvwxyz] ?\d[abceghjklmnprstvwxyz]\d\b/, // Canadian postal code
  /\b\d{1,5} [a-z]+( [a-z]+)? (street|st|avenue|ave|road|rd|drive|dr|court|crt|crescent|cres|boulevard|blvd|lane|ln|way|place|pl|trail|circle)\b/, // street address
  /\bi live (at|on) \w+/,
  /\b(my )?(last|full|real) name is\b/,
  /\b(add|follow|text|dm) me (on|at)\b|\bmy (snap|snapchat|insta|instagram|tiktok|discord|whatsapp|number|phone)( is|:)/,
];
// Checked on original casing: "my name is Maya Singh".
const FULL_NAME = /\b(?:[Mm]y name is|[Ii]'?m|[Ii] am|[Cc]all me)\s+([A-Z][a-z]+)\s+([A-Z][a-z]{1,})\b/;
const NOT_SURNAME = new Set(['Not', 'So', 'Very', 'Really', 'Just', 'Confused', 'Sure', 'The', 'Also', 'Here', 'Done', 'Thinking', 'Lost', 'Ready', 'Back']);

const BULLYING = [
  /\b(you|u|ur|you'?re|youre|you are|u r) (are |r )?(so |such an? |really |an? |the )?(stupid|dumb|idiot|moron|ugly|fat|loser|trash|useless|annoying|weird|freak|pathetic)\b/,
  /\b(shut up|stfu|nobody likes you|no ?one likes you|you suck|u suck|go away loser|get lost)\b/,
  /\b(kill yourself|kys|go die)\b/,
  /\b(stupid|dumb|idiotic|trash) (idea|answer|question|person|kid)\b/,
  /\b(idiot|loser|moron|freak)\b/,
];
const SEVERE_BULLYING = /\b(kill yourself|kys|go die)\b/;

const PROFANITY = /\b(fuck\w*|f[^a-z\s]{1,2}c?k\w*|shit\w*|bitch\w*|bastard|ass ?hole|asshat|dick(head)?|cunt|piss off|wtf|retard(ed)?|slut|whore|cock|douche\w*)\b/;

const INJECTION = [
  /\bignore (all |your |the |any |previous |prior |above )*(rules|instructions|prompt)/,
  /\bforget (all |your |the )*(rules|instructions)\b/,
  /\b(system prompt|jailbreak|developer mode)\b/,
  /\bpretend (you are|you're|to be)\b/,
  /\byou are now\b/,
  /\bact as (a|an|my)\b/,
  /\b(reveal|show|print) (me )?(your|the) (prompt|instructions|rules)\b/,
];

const OFF_TOPIC_REQUEST = [
  /\b(tell|give) (me|us) a joke\b/,
  /\b(let'?s|can we|wanna) play\b/,
  /\bwrite (me |us )?a (poem|story|rap|song)\b/,
  /\bwhat'?s your fav(ou?rite)?\b|\bdo you like\b/,
  /\b(fortnite|minecraft|roblox|tiktok|youtube|anime|pokemon)\b/,
  /\b(do|help with) my (math|french|english|history) homework\b/,
  /\bwho would win\b/,
];

export function moderateText(text: string): ModResult {
  const t = deobfuscate(text);
  const raw = norm(text);

  if (DISTRESS.some((re) => re.test(t) || re.test(raw))) {
    return { action: 'urgent', category: 'distress', reason: 'Message suggests the student may be unsafe or in distress', alertLevel: 'urgent' };
  }
  const nameMatch = FULL_NAME.exec(text);
  if (PII.some((re) => re.test(raw)) || (nameMatch && !NOT_SURNAME.has(nameMatch[2]))) {
    return { action: 'hide', category: 'personal-info', reason: 'Message appears to share personal information', alertLevel: 'warning' };
  }
  if (BULLYING.some((re) => re.test(t))) {
    const severe = SEVERE_BULLYING.test(t);
    return { action: 'hide', category: 'bullying', reason: severe ? 'Severe bullying language' : 'Unkind or bullying language', alertLevel: severe ? 'urgent' : 'warning' };
  }
  if (PROFANITY.test(t)) {
    return { action: 'hide', category: 'profanity', reason: 'Profanity', alertLevel: 'warning' };
  }
  if (INJECTION.some((re) => re.test(raw))) {
    return { action: 'allow', category: 'injection', reason: 'Attempt to change the AI’s rules', alertLevel: 'info' };
  }
  if (OFF_TOPIC_REQUEST.some((re) => re.test(raw))) {
    return { action: 'allow', category: 'off-topic', reason: 'Off-topic request' };
  }
  return { action: 'allow', reason: 'No issues found' };
}

/** Async boundary so the engine can handle an unavailable moderation service (edge case §6). */
export interface Moderator {
  check(text: string): Promise<ModResult>;
}

export const localModerator: Moderator = {
  async check(text) {
    return moderateText(text);
  },
};

export const GENTLE_REMINDERS: Record<string, string> = {
  bullying: "Your message wasn't shared. In ThinkCircle we disagree with ideas, not people. Try saying it in a kind way.",
  profanity: "Your message wasn't shared because of the language. Try saying it another way.",
  'personal-info': "Your message wasn't shared. To keep you safe, don't share names, phone numbers, addresses or accounts here.",
  distress: "Thank you for telling us. Your message went only to your teacher, who will check in with you.",
};
