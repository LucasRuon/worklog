export interface PluginRecord {
  originId: string; occurredAt: string; nativeSessionId: string; parentSessionId?: string; cwd: string;
  type: string; payload: Record<string, string>;
}
export const supportedOpenCodePluginVersions = ['2.2.5', '2.2.6'];
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export const v2EventTypes = ['session.created', 'session.inbox.delivered', 'session.step.started', 'session.step.ended', 'session.step.failed', 'session.tool.input.started', 'session.tool.called', 'session.tool.success', 'session.tool.failed', 'session.execution.interrupted', 'session.execution.failed', 'session.compaction.started'] as const;

export function projectV2Event(value: unknown, context: { cwd: string; toolName?: string; parentSessionId?: string }): PluginRecord | null {
  const event = record(value); const data = record(event?.data);
  if (!event || !data || typeof event.id !== 'string' || typeof data.sessionID !== 'string' || typeof event.created !== 'number' || !Number.isFinite(event.created)) return null;
  let type: string; let payload: Record<string, string>;
  switch (event.type) {
    case 'session.created': type = 'session.start'; payload = { reason: data.parentID ? 'subagent' : 'startup' }; break;
    case 'session.inbox.delivered': type = 'turn.submit'; payload = typeof data.inboxID === 'string' ? { turnId: data.inboxID } : {}; break;
    case 'session.step.started': type = 'turn.start'; payload = typeof data.assistantMessageID === 'string' ? { turnId: data.assistantMessageID } : {}; break;
    case 'session.step.ended': case 'session.step.failed': type = 'turn.end'; payload = { ...(typeof data.assistantMessageID === 'string' ? { turnId: data.assistantMessageID } : {}), outcome: event.type === 'session.step.failed' ? 'failed' : 'completed' }; break;
    case 'session.tool.called': type = 'tool.start'; payload = { toolName: context.toolName ?? 'opencode-tool', toolUseId: String(data.id) }; break;
    case 'session.tool.success': case 'session.tool.failed': type = 'tool.end'; payload = { toolName: context.toolName ?? 'opencode-tool', toolUseId: String(data.id), outcome: event.type === 'session.tool.failed' ? 'failed' : 'completed' }; break;
    case 'session.execution.interrupted': case 'session.execution.failed': type = 'session.interrupt'; payload = { reason: event.type === 'session.execution.interrupted' ? 'user' : 'error' }; break;
    case 'session.compaction.started': type = 'session.start'; payload = { reason: 'compact' }; break;
    default: return null;
  }
  const parent = typeof data.parentID === 'string' ? data.parentID : context.parentSessionId;
  return { originId: event.id, occurredAt: new Date(event.created).toISOString(), nativeSessionId: data.sessionID, cwd: context.cwd, ...(parent ? { parentSessionId: parent } : {}), type, payload };
}
