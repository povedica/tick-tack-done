import { describe, expect, it } from 'vitest';
import { findTool } from './mcp.catalog.js';
import { validateMcpArgs } from './mcp-args.js';

describe('validateMcpArgs (TTD-AUD-54)', () => {
  const update = findTool('update_task');
  const create = findTool('create_task');

  it('rejects unknown fields with a clear list', () => {
    expect(update).toBeDefined();
    if (update === undefined) {
      return;
    }
    const result = validateMcpArgs(update.inputSchema, {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
      parent_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain('Campos no admitidos: status');
    expect(result.message).toContain('Campos válidos:');
  });

  it('rejects wrong enum and wrong type', () => {
    expect(update).toBeDefined();
    expect(create).toBeDefined();
    if (update === undefined || create === undefined) {
      return;
    }
    expect(
      validateMcpArgs(update.inputSchema, {
        id: '11111111-1111-4111-8111-111111111111',
        priority: 'urgent',
      }).ok,
    ).toBe(false);
    expect(
      validateMcpArgs(create.inputSchema, {
        title: 'Demo',
        duration_minutes: '30',
      }).ok,
    ).toBe(false);
  });

  it('accepts a valid create_task payload', () => {
    expect(create).toBeDefined();
    if (create === undefined) {
      return;
    }
    expect(
      validateMcpArgs(create.inputSchema, {
        title: 'Demo',
        due_date: '2026-10-22',
        duration_minutes: 30,
        priority: 'high',
      }),
    ).toEqual({ ok: true });
  });
});
