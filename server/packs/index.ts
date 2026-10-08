import type { ConceptPack, PackSummary } from '../../shared/types.js';
import { fluids } from './fluids.js';
import { cells } from './cells.js';
import { water } from './water.js';

export const PACKS: ConceptPack[] = [fluids, cells, water];

export function getPack(id: string): ConceptPack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function summarizePack(p: ConceptPack): PackSummary {
  return { id: p.id, title: p.title, subject: p.subject, grade: p.grade, strand: p.strand, learningGoal: p.learningGoal };
}
