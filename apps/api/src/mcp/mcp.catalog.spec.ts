import { describe, expect, it } from 'vitest';
import { MCP_TOOLS, visibleTools } from './mcp.catalog.js';

describe('MCP tool catalog', () => {
  it('RF-2001: a tasks token cannot see tools outside its scopes', () => {
    const names = visibleTools(['tasks:read', 'tasks:write']).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['list_tasks', 'create_task', 'complete_task', 'search']),
    );
    for (const hidden of [
      'list_habits',
      'create_habit',
      'list_projects',
      'create_filter',
      'list_notes',
      'start_focus',
    ]) {
      expect(names).not.toContain(hidden);
    }
  });

  it('RF-2001: paged listings accept the API v1 cursor', () => {
    for (const name of [
      'list_tasks',
      'list_projects',
      'list_tags',
      'list_filters',
      'list_smart_list_tasks',
      'list_habits',
    ]) {
      const tool = MCP_TOOLS.find((item) => item.name === name);
      expect(tool?.inputSchema.properties).toHaveProperty('cursor');
      expect(tool?.inputSchema.additionalProperties).toBe(false);
    }
  });

  it('RF-2001: read scopes do not include write tools', () => {
    const names = visibleTools(['tasks:read']).map((tool) => tool.name);
    expect(names).toContain('list_tasks');
    expect(names).not.toContain('create_task');
    expect(names).not.toContain('complete_task');
  });

  it('RF-2532: calendar tools follow calendar scopes', () => {
    const read = visibleTools(['calendar:read']).map((tool) => tool.name);
    expect(read).toEqual(
      expect.arrayContaining(['list_external_calendars', 'list_calendar_events']),
    );
    expect(read).not.toContain('sync_calendar');
    expect(read).not.toContain('add_external_calendar');
    const write = visibleTools(['calendar:write']).map((tool) => tool.name);
    expect(write).toContain('sync_calendar');
    expect(write).not.toContain('list_calendar_events');
    const tasks = visibleTools(['tasks:read']).map((tool) => tool.name);
    expect(tasks).not.toContain('list_external_calendars');
  });
});
