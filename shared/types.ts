// Types shared by server and client. Entity meanings follow Spec §5.

export const STAGES = ['hook', 'probe', 'challenge', 'construct', 'consolidate'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  hook: 'Hook',
  probe: 'Probe',
  challenge: 'Challenge',
  construct: 'Construct',
  consolidate: 'Consolidate',
};

export type EngagementState = 'engaged' | 'confused' | 'frustrated' | 'disengaged' | 'ahead' | 'dominating';

export type MoveType =
  | 'open'
  | 'probe'
  | 'challenge'
  | 'hint'
  | 'invite'
  | 'connect'
  | 'advance'
  | 'support'
  | 'redirect'
  | 'language'
  | 'own-words'
  | 'regroup'
  | 'summary'
  | 'fallback'
  | 'distress';

export type Behaviour =
  | 'reasoning'
  | 'build-on-peer'
  | 'good-question'
  | 'changed-mind'
  | 'explain-to-peer'
  | 'first-contribution'
  | 'team-bonus';

export const RUBRIC_VERSION = 'rubric-v0.1 (pending teacher-advisor review)';

export interface KeyIdea {
  id: string;
  text: string;
  /** Every inner group must have at least one phrase present (AND of ORs). Phrases match at word starts. */
  keywords: string[][];
}

export interface StageDef {
  goal: string;
  questions: string[];
  keyIdeaIds: string[];
  /** Share of session duration this stage may take before auto-advancing (FR-013). */
  timeShare: number;
}

export interface ConceptPack {
  id: string;
  title: string;
  subject: string;
  grade: number;
  strand: string;
  learningGoal: string;
  /** Never sent to students. Used only by the answer-leak guard (FR-012). */
  targetAnswer: string;
  answerLeakPatterns: string[];
  topicKeywords: string[];
  keyIdeas: KeyIdea[];
  misconceptions: { id: string; text: string; keywords: string[][]; probe: string }[];
  stages: Record<Stage, StageDef>;
  hints: string[];
  harderQuestions: string[];
  easierQuestions: string[];
  analogies: string[];
  fallbackQuestions: string[];
  /** Lines simulated students use, by stage. Demo/test only. */
  simLines: Record<Stage, string[]>;
}

export interface PackSummary {
  id: string;
  title: string;
  subject: string;
  grade: number;
  strand: string;
  learningGoal: string;
}

export type MessageStatus = 'shown' | 'hidden' | 'held';

export interface ChatMessage {
  id: string;
  groupId: string;
  sender: 'student' | 'ai' | 'teacher' | 'system';
  participantId?: string;
  nickname?: string;
  text: string;
  ts: number;
  status: MessageStatus;
  move?: MoveType;
  targetId?: string;
  /** Teacher-only: why the AI made this move (Constitution 9). */
  reason?: string;
  /** Teacher-only: moderation category if hidden/held. */
  flag?: string;
  /** Visible only to this participant (and the teacher), e.g. a supportive reply to a distress message. */
  privateTo?: string;
}

export interface ScoreEvent {
  id: string;
  sessionId: string;
  groupId: string;
  participantId: string | null; // null for team bonus
  behaviour: Behaviour;
  points: number;
  reason: string;
  messageId?: string;
  stage: Stage;
  ts: number;
  override?: { points: number; reason: string; by: string; ts: number };
}

export type AlertKind =
  | 'bullying'
  | 'profanity'
  | 'personal-info'
  | 'distress'
  | 'injection'
  | 'stalled'
  | 'ai-unavailable'
  | 'moderation-unavailable'
  | 'small-class';

export interface Alert {
  id: string;
  sessionId: string;
  groupId?: string;
  participantId?: string;
  nickname?: string;
  level: 'info' | 'warning' | 'urgent';
  kind: AlertKind;
  text: string;
  excerpt?: string;
  ts: number;
  acknowledged: boolean;
}

export interface MemberView {
  id: string;
  nickname: string;
  points: number;
  left: boolean;
  connected: boolean;
  isSim?: boolean;
}

export interface GroupView {
  id: string;
  name: string;
  stage: Stage;
  teamScore: number;
  teamBonusAwarded: boolean;
  paused: boolean;
  status: 'active' | 'complete';
  thinking: boolean;
  stalled: boolean;
  members: MemberView[];
  summary?: string;
}

export interface ScoreboardTeam {
  groupId: string;
  name: string;
  rank: number;
  teamScore: number;
  summary: string;
  members: { id: string; nickname: string; points: number; badge: string; left: boolean }[];
}

export interface Scoreboard {
  teams: ScoreboardTeam[];
  individual?: { nickname: string; points: number; rank: number }[];
}

export type SessionStatus = 'waiting' | 'running' | 'ended';

export interface StudentState {
  sessionStatus: SessionStatus;
  packTitle: string;
  me: { id: string; nickname: string; points: number; left: boolean };
  group?: GroupView;
  messages: ChatMessage[];
  awards: ScoreEvent[];
  endsAt?: number;
  warning?: string;
  scoreboard?: Scoreboard;
  waitingCount: number;
}

export interface TeacherParticipantView extends MemberView {
  groupId?: string;
  state: EngagementState;
  stateConfidence: number;
  messageCount: number;
}

export interface TeacherGroupView extends GroupView {
  messages: ChatMessage[];
}

export interface AuditEntry {
  ts: number;
  type: 'score' | 'move' | 'moderation' | 'stage' | 'override' | 'engagement';
  groupId?: string;
  participantId?: string;
  inputs: unknown;
  output: unknown;
  reason: string;
  rubricVersion: string;
}

export interface TeacherState {
  sessionId: string;
  code: string;
  status: SessionStatus;
  locked: boolean;
  pack: PackSummary;
  groupSize: number;
  durationMin: number;
  showIndividualRankings: boolean;
  startedAt?: number;
  endsAt?: number;
  waiting: TeacherParticipantView[];
  participants: TeacherParticipantView[];
  groups: TeacherGroupView[];
  alerts: Alert[];
  scoreEvents: ScoreEvent[];
  scoreboard?: Scoreboard;
  aiProvider: string;
  aiCost: { calls: number; promptTokens: number; outputTokens: number; totalMs: number; fallbacks: number; estimatedUsd: number };
  warnings: string[];
}
