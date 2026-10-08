export const MAX_GROUP = 6;

/**
 * Split participants into balanced groups near the chosen size (FR-006, edge case "only 1–2 students").
 * Group sizes differ by at most 1, never exceed 6, and no one is left alone unless only one student joined.
 */
export function splitIntoGroups<T>(ids: T[], groupSize: number): { groups: T[][]; warnings: string[] } {
  const n = ids.length;
  const warnings: string[] = [];
  if (n === 0) return { groups: [], warnings: ['No students have joined yet.'] };
  if (n < 3) warnings.push(`Only ${n} student${n === 1 ? '' : 's'} joined; groups work best with 3 or more.`);

  let count = Math.max(1, Math.round(n / groupSize));
  while (Math.ceil(n / count) > MAX_GROUP) count++;
  while (count > 1 && Math.floor(n / count) < 2) count--;

  const groups: T[][] = Array.from({ length: count }, () => []);
  ids.forEach((id, i) => groups[i % count].push(id));
  return { groups, warnings };
}

/** Index of the group a late joiner goes to: the smallest one (FR-006). -1 means start a new group. */
export function pickGroupForLateJoiner(sizes: number[]): number {
  if (sizes.length === 0) return -1;
  let best = 0;
  sizes.forEach((s, i) => {
    if (s < sizes[best]) best = i;
  });
  return sizes[best] >= MAX_GROUP ? -1 : best;
}

export const GROUP_NAMES = ['Orbit', 'Comet', 'Nova', 'Quasar', 'Nebula', 'Pulsar', 'Aurora', 'Meteor', 'Galaxy', 'Zenith', 'Photon', 'Vortex'];
