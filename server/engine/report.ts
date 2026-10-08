import type { Behaviour, TeacherState } from '../../shared/types.js';

const BEHAVIOURS: Behaviour[] = ['reasoning', 'build-on-peer', 'good-question', 'changed-mind', 'explain-to-peer', 'first-contribution'];

const cell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Early cut of FR-053/054: per-student participation and points by behaviour. */
export function buildReportCsv(state: TeacherState): string {
  const header = ['team', 'nickname', 'messages', 'total_points', ...BEHAVIOURS, 'left_early'];
  const rows = [header.join(',')];
  for (const g of state.groups) {
    for (const m of g.members) {
      const p = state.participants.find((x) => x.id === m.id);
      const events = state.scoreEvents.filter((e) => e.participantId === m.id);
      const by = (b: Behaviour) => events.filter((e) => e.behaviour === b).reduce((a, e) => a + (e.override?.points ?? e.points), 0);
      rows.push([g.name, m.nickname, p?.messageCount ?? 0, m.points, ...BEHAVIOURS.map(by), m.left ? 'yes' : 'no'].map(cell).join(','));
    }
  }
  return rows.join('\n') + '\n';
}
