import { describe, expect, it } from 'vitest';
import { visibleTools } from './mcp.catalog';

describe('MCP tool catalog', () => {
  it('RF-2001: a tasks token cannot see tools outside its scopes', () => {
    const names = visibleTools(['tasks:read', 'tasks:write']).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['list_tasks', 'create_task', 'complete_task', 'search']),
    );
    for (const hidden of ['list_habits', 'create_habit', 'list_projects', 'create_filter']) {
      expect(names).not.toContain(hidden);
    }
  });

  it('RF-2001: read scopes do not include write tools', () => {
    const names = visibleTools(['tasks:read']).map((tool) => tool.name);
    expect(names).toContain('list_tasks');
    expect(names).not.toContain('create_task');
    expect(names).not.toContain('complete_task');
  });
});
