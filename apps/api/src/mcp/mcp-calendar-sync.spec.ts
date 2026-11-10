import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpService } from './mcp.service.js';

const user = {
  requestSource: 'mcp' as const,
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  displayName: 'Ada',
  timeZone: 'Europe/Madrid',
  weekStartsOn: 1 as const,
  completeChildren: 'ask' as const,
  scopes: ['calendar:read', 'calendar:write'],
  tokenId: null,
  sessionId: null,
  listIds: null,
};

describe('MCP calendar sync health', () => {
  const calendars = {
    syncReported: vi.fn(),
    syncStatus: vi.fn(),
    syncAll: vi.fn(),
    listSubscriptions: vi.fn(),
    listGoogleCalendars: vi.fn(),
    range: vi.fn(),
  };
  let service: McpService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      calendars as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('RF-2567: get_calendar_sync_status returns the sync-status document', async () => {
    calendars.syncStatus.mockResolvedValue({
      google: { status: 'connected', connected: true, account: 'ada@example.com' },
      subscriptions: [],
    });
    const result = await service.handle(
      { ...user, scopes: ['calendar:read'] },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_calendar_sync_status', arguments: {} },
      },
    );
    const text = textOf(result);
    expect(JSON.parse(text)).toEqual({
      google: { status: 'connected', connected: true, account: 'ada@example.com' },
      subscriptions: [],
    });
  });

  it('RF-2563: sync_calendar includes reconnect health in the tool result', async () => {
    calendars.syncReported.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      imported: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      synced_at: '2026-11-10T08:00:00.000Z',
      health: 'reconnect_required',
      error: 'google_reconnect_required',
      last_error: 'google_reconnect_required',
      last_synced_at: null,
    });
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'sync_calendar',
        arguments: { subscription_id: '33333333-3333-4333-8333-333333333333' },
      },
    });
    expect(JSON.parse(textOf(result))).toEqual(
      expect.objectContaining({
        health: 'reconnect_required',
        error: 'google_reconnect_required',
      }),
    );
  });
});

function textOf(result: unknown): string {
  const body = result as { result?: { content?: { text?: string }[] } };
  return body.result?.content?.[0]?.text ?? '';
}
