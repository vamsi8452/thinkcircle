import type { ConceptPack, Stage } from '../../shared/types.js';
import type { Decision } from '../core/facilitator.js';

export interface GenerateRequest {
  pack: ConceptPack;
  stage: Stage;
  decision: Decision;
  targetNick?: string;
  peerNick?: string;
  transcript: { who: string; text: string }[];
  /** The rules-based message for this move. LLM providers use it as a model answer; rules provider returns it. */
  draft: string;
  /** Set on a retry after the guard rejected the previous output. */
  rejectedBecause?: string[];
}

export interface GenerateResult {
  text: string;
  promptTokens?: number;
  outputTokens?: number;
}

export interface AiProvider {
  name: string;
  /** Estimated cost per 1M tokens, for NFR-015 reporting. Local models are $0. */
  usdPerMTokIn: number;
  usdPerMTokOut: number;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
}

export const rulesProvider: AiProvider = {
  name: 'rules (deterministic, from concept pack)',
  usdPerMTokIn: 0,
  usdPerMTokOut: 0,
  async generate(req) {
    return { text: req.draft };
  },
};
