import type { WorklogDatabase } from './sqlite.js';

export interface AppContext {
  db: WorklogDatabase;
  config: { dataDir: string; port: number; origin: string; timezone: string; deviceId: string; installationId: string };
  shutdown: () => Promise<void>;
}
export type Tool = 'claude' | 'codex' | 'opencode' | 'git' | 'files' | 'focus';
export type Confidence = 'explicit' | 'inferred' | 'unlinked';
export type Outcome = 'completed' | 'failed' | 'interrupted';
export interface EventPayloads {
  'session.start': { reason: 'startup' | 'resume' | 'compact' | 'subagent' | 'unknown' };
  'session.end': { reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other' | 'subagent' };
  'session.interrupt': { reason: 'user' | 'error' | 'unknown' };
  'turn.submit': { turnId?: string };
  'turn.start': { turnId?: string };
  'turn.end': { turnId?: string; outcome: Outcome };
  'tool.start': { toolName: string; toolUseId: string };
  'tool.end': { toolName: string; toolUseId: string; outcome: Outcome };
  'human.interaction': { kind: 'prompt' | 'explicit'; projectId?: string };
  'focus.change': { projectId?: string; sessionId?: string; confidence: 'explicit' | 'observed' | 'unresolved' };
  'machine.idle': { reason: 'idle' | 'lock' | 'sleep' | 'pause' };
  'machine.resume': Record<string, never>;
  'file.change': { rootId: string; path: string; operation: 'create' | 'edit' | 'delete' | 'rename'; sha256?: string };
  'git.commit': { repositoryId: string; sha: string };
  /** Título curto da task do agente; só existe com captura opt-in (`captureTaskTitles`). */
  'task.update': { status: 'pending' | 'in_progress' | 'completed'; title?: string; taskId?: string };
}
export type EventType = keyof EventPayloads;
interface EventIdentity {
  schemaVersion: 1; eventId: string; deviceId: string; installationId: string; sourceId: string;
  tool: Tool; occurredAt: string; nativeSessionId?: string; nativeAgentId?: string; parentSessionId?: string; cwd?: string;
}
export type EventInput = { [K in EventType]: EventIdentity & { type: K; payload: EventPayloads[K] } }[EventType];
export type WorkEvent = EventInput & { originSeq: number; receivedAt: string };
export interface Cursor { installationId: string; seq: number }
export interface AppendResult { inserted: number; duplicates: number; cursor: Cursor }
export interface EventBatch { schemaVersion: 1; installationId: string; events: WorkEvent[]; nextCursor: Cursor; hasMore: boolean }
export interface SourceRegistration {
  id: string; deviceId: string; installationId: string; tool: Tool; profile: string; configPath: string; version: string; enabled: boolean;
}
export interface ProjectRoot {
  id?: string; projectId?: string; projectName: string; client?: string; deviceId: string; path: string;
  repositoryId?: string; remote?: string; worktree?: string; enabled?: boolean;
}
export type ProjectMatch = { state: 'matched'; projectId: string; repositoryId: string | null; rootId: string; worktree: string; reason: 'authorized-root' }
  | { state: 'unassigned'; reason: 'outside-roots' | 'invalid-path' | 'paused' };
export interface Project { id: string; name: string; client: string | null; clientId: string | null; roots: ProjectRoot[] }
export interface Session {
  id: string; sourceId: string; deviceId: string; tool: Tool; profile: string; nativeSessionId: string; nativeAgentId: string | null;
  parentSessionId: string | null; projectId: string | null; startedAt: string; lastEventAt: string; endedAt: string | null;
  state: 'running' | 'waiting' | 'interrupted' | 'closed' | 'incomplete'; complete: boolean; eventCount: number;
  provenance?: 'observed' | 'imported' | 'mixed';
}
export interface ReportFilter { projectIds: string[]; from: string; to: string; timezone: string; deviceIds?: string[]; tools?: Tool[]; sourceIds?: string[]; includeUnassigned?: boolean; onlyUnassigned?: boolean }
export interface Interval { start: string; end: string; sessionId: string; projectId?: string; quality: 'observed' | 'estimated' | 'adjusted' }
export interface TimeSummary {
  humanEstimatedMs: number; humanAdjustedMs: number; humanManualMs: number; unassignedHumanMs: number; agentAccumulatedMs: number; agentWallMs: number; sessionSpanMs: number;
  incompleteSessions: number; ruleVersion: string;
  humanSignalCount: number;
}
export interface PolicyConfig { maxTextBytes: number; allowExamples: string[]; excludedPaths: string[] }
export interface CaptureDecision { metadata: boolean; content: boolean; reason: string; relativePath?: string }
export interface FileRevision {
  id: string; rootId: string; fileId: string; path: string; sha256: string | null; occurredAt: string;
  operation: 'baseline' | 'create' | 'edit' | 'delete' | 'rename'; observation: 'baseline' | 'watch' | 'reconciliation';
  previousPath: string | null; previousRevisionId: string | null; size: number;
  content?: string; unavailableReason: string | null;
}
export interface FileChange extends Omit<FileRevision, 'content'> { projectId: string; deviceId: string; associationConfidence?: Confidence }
export interface FileScan { rootId: string; projectId: string; deviceId: string; path: string; scannedAt: string | null; monitoringSince: string | null; error: string | null; lastGapAt: string | null; pending: boolean }
export interface FileDetail {
  revision: FileChange; content: string | null; diff: { patch: string | null; reason: string | null };
  history: FileChange[]; historyHasMore: boolean;
  links: (EvidenceLink & { kind: 'session' | 'commit'; label: string })[];
  sessionCandidates: { id: string; nativeSessionId: string; tool: Tool }[];
}
export interface EvidenceLink { sourceId: string; targetId: string; confidence: Confidence; reason: string }
export interface PullRequestSnapshot {
  id: string; provider: string; repositoryId: string; number: number; url: string; title: string; state: 'open' | 'closed' | 'merged'; draft: boolean; updatedAt: string; stale: boolean;
  author: string; baseBranch: string; headBranch: string; headSha: string; createdAt: string; closedAt: string | null; mergedAt: string | null;
  commits: string[]; commitsState: 'available' | 'unavailable';
  reviews: { state: 'available' | 'unavailable'; items: { id: number; author: string; state: string; submittedAt: string | null }[] };
  checks: { state: 'available' | 'none' | 'unavailable'; items: { id: number; name: string; status: string; conclusion: string | null }[] };
}
export interface Adjustment { id: string; projectId: string; start: string; end: string; previousMs: number; nextMs: number; reason: string; createdAt: string; deviceId: string; sourceId: string; undoOf: string | null; revision: number }
export interface AdjustmentInput { projectId: string; start: string; end: string; nextMs: number; reason: string; revision: number }
export type NoteClassification = 'work' | 'pending' | 'verification' | 'context';
export interface Note { id: string; targetId: string; projectId: string; text: string; classification: NoteClassification; revision: number; occurredAt: string; createdAt: string; deviceId: string; sourceId: string }
export interface Diagnostic { code: string; status: 'ok' | 'warning' | 'error'; message: string }
export interface GitFile { path: string; previousPath: string | null; status: string }
export interface GitCommit {
  id: string; repositoryId: string; sha: string; parents: string[]; authorName: string; authorEmail: string;
  authoredAt: string; committerName: string; committerEmail: string; committedAt: string; message: string;
  files: GitFile[];
  origins: { rootId: string; deviceId: string; projectId: string; reachable: boolean; observedAt: string; refs: string[] }[];
}
export interface GitScan { rootId: string; projectId: string; deviceId: string; path: string; scannedAt: string | null; pending: boolean; error: string | null }
export type CommitDetail = GitCommit & { pullRequests: PullRequestSnapshot[] };
export interface ReportOptions { sessions: boolean; notes: boolean; files: boolean; commits: boolean; prs: boolean; fullDiff: boolean }
export interface ReportData {
  filter: ReportFilter; options: ReportOptions; summary: TimeSummary; sessions: Session[]; commits: (GitCommit & { url: string | null })[]; generatedAt: string;
  projects: { id: string; name: string; client: string | null; summary: TimeSummary; sessionCount: number }[];
  devices: { id: string; name: string }[]; warnings: string[];
  notes: Note[]; revisions: (FileChange & { diff?: { patch: string | null; reason: string | null } })[]; prs: (PullRequestSnapshot & { projectIds: string[] })[]; adjustments: (Adjustment & { undone: boolean })[]; adjustmentRevision: number;
}

export class DomainError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new DomainError('INVALID_OBJECT');
}
export function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => ![...required, ...optional].includes(key))) throw new DomainError('INVALID_FIELDS');
}
export function uuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new DomainError('INVALID_ID');
}
export function utc(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new DomainError('INVALID_TIMESTAMP');
}
export function shortId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value)) throw new DomainError('INVALID_NATIVE_ID');
}
export const tools: Tool[] = ['claude', 'codex', 'opencode', 'git', 'files', 'focus'];
