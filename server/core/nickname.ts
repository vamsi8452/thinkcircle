import { moderateText } from './moderation.js';

// Common first names used to spot "Firstname Lastname" nicknames (FR-005).
// A heuristic: it will miss some names and is reviewed by the teacher, who can remove a participant.
const FIRST_NAMES = new Set(
  `aaron abdul abigail adam adrian ahmed aiden aisha alex alexander alexandra ali alice alicia amanda amelia amir amy ana andrea andrew angela anna anthony aria ariana arjun aryan ashley austin ava benjamin bella blake brandon brian brooke caleb cameron carlos caroline charlie charlotte chloe chris christian christopher claire cole connor daniel david diego dylan eli elijah elizabeth ella emily emma eric ethan evan evelyn faith fatima gabriel grace hannah harper harry hassan henry hunter ian isaac isabella jack jackson jacob jade james jasmine jason jayden jessica john jonathan jordan joseph joshua julia justin kai karan kayla kevin kyle laila landon lauren leah leo liam lily logan lucas luke madison maria mason matthew maya mia michael mohammed muhammad nathan noah nora oliver olivia omar owen priya rachel rahul raj riley ryan samantha samuel sara sarah sebastian sophia sophie thomas tyler victoria william wyatt yusuf zachary zara zoe`.split(
    /\s+/,
  ),
);

export type NicknameResult = { ok: true; nickname: string } | { ok: false; error: string };

export function looksLikeFullName(nickname: string): boolean {
  const parts = nickname.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const alpha = parts.every((p) => /^[a-zA-Z'-]{2,}$/.test(p));
  return alpha && FIRST_NAMES.has(parts[0].toLowerCase());
}

export function validateNickname(raw: string, taken: string[]): NicknameResult {
  const nickname = raw.trim().replace(/\s+/g, ' ');
  if (nickname.length < 2 || nickname.length > 20) {
    return { ok: false, error: 'Pick a nickname between 2 and 20 characters.' };
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(nickname)) {
    return { ok: false, error: 'Use letters, numbers, spaces, - or _ only.' };
  }
  if (looksLikeFullName(nickname)) {
    return { ok: false, error: "That looks like a real name. Pick a fun nickname instead, like 'BlueFox'." };
  }
  const mod = moderateText(nickname);
  if (mod.action !== 'allow' || mod.category === 'injection') {
    return { ok: false, error: 'Please pick a different nickname.' };
  }
  if (taken.some((t) => t.toLowerCase() === nickname.toLowerCase())) {
    return { ok: false, error: 'Someone already has that nickname. Please pick another.' };
  }
  return { ok: true, nickname };
}
