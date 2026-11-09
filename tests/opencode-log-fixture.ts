export function nativeLog(cwd: string, version = '2.2.5') {
  const sessionID = 'native-log'; const base = Date.parse('2026-11-06T09:00:00.000Z');
  const entries: [string, Record<string, unknown>][] = [
    ['session.created', { location: { directory: cwd }, version, parentID: 'parent-session', title: 'PRIVATE_TRANSCRIPT' }],
    ['session.inbox.delivered', { inboxID: 'inbox-one', text: 'PRIVATE_TRANSCRIPT' }],
    ['session.step.started', { assistantMessageID: 'assistant-one' }],
    ['session.tool.input.started', { assistantMessageID: 'assistant-one', id: 'call-one', name: 'Bash' }],
    ['session.tool.called', { assistantMessageID: 'assistant-one', id: 'call-one', input: { token: 'PRIVATE_TRANSCRIPT' } }],
    ['session.tool.success', { assistantMessageID: 'assistant-one', id: 'call-one', output: 'PRIVATE_TRANSCRIPT' }],
    ['session.step.ended', { assistantMessageID: 'assistant-one' }],
    ['session.execution.succeeded', {}],
    ['session.compaction.started', {}],
    ['session.execution.interrupted', {}],
  ];
  const events = entries.map(([type, data], index) => ({ id: `event-${index}`, type, created: base + index * 1000, durable: { aggregateID: sessionID, seq: index + 1, version: 1 }, data: { sessionID, ...data } as Record<string, unknown> & { sessionID: string } }));
  const marker = { type: 'log.synced', aggregateID: sessionID, seq: events.length };
  const frame = (data: unknown) => `event: message\ndata: ${JSON.stringify(data)}\n\n`;
  return { events, marker, frame, bytes: events.map(frame).join('') + frame(marker) };
}
