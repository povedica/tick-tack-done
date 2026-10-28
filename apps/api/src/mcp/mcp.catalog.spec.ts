import { describe, expect, it } from 'vitest';
import { MCP_TOOLS, visibleTools } from './mcp.catalog.js';

describe('MCP tool catalog', () => {
  it('RF-2001: capture defaults require profile scopes', () => {
    const tasks = visibleTools(['tasks:write']).map((tool) => tool.name);
    expect(tasks).not.toContain('get_capture_settings');
    expect(tasks).not.toContain('update_capture_settings');
    expect(visibleTools(['profile:read']).map((tool) => tool.name)).toContain(
      'get_capture_settings',
    );
    expect(visibleTools(['profile:read']).map((tool) => tool.name)).not.toContain(
      'update_capture_settings',
    );
    expect(visibleTools(['profile:write']).map((tool) => tool.name)).toContain(
      'update_capture_settings',
    );
  });

  it('work context uses profile:read and workday:write, and listings accept context', () => {
    expect(visibleTools(['profile:read']).map((tool) => tool.name)).toContain('get_work_context');
    expect(visibleTools(['profile:read']).map((tool) => tool.name)).not.toContain(
      'update_work_context',
    );
    expect(visibleTools(['profile:write']).map((tool) => tool.name)).not.toContain(
      'update_work_context',
    );
    expect(visibleTools(['workday:write']).map((tool) => tool.name)).toContain(
      'update_work_context',
    );
    const update = MCP_TOOLS.find((tool) => tool.name === 'update_work_context');
    expect(update?.description).toContain('arrays replace the whole set');
    expect(update?.scopes).toEqual(['workday:write']);
    for (const name of [
      'list_tasks',
      'list_smart_list_tasks',
      'get_day_load',
      'list_calendar_events',
      'get_day_plan',
    ]) {
      const tool = MCP_TOOLS.find((item) => item.name === name);
      expect(tool?.inputSchema.properties).toHaveProperty('context');
    }
  });
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
      'get_filter',
      'update_filter',
      'delete_filter',
      'restore_filter',
      'list_filter_tasks',
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
    expect(names).toContain('list_task_comments');
    expect(names).toContain('list_task_attachments');
    expect(names).not.toContain('create_task');
    expect(names).not.toContain('complete_task');
    expect(names).not.toContain('delete_task');
  });

  it('TTD-AUD-50: trash tools require tasks:trash', () => {
    const write = visibleTools(['tasks:read', 'tasks:write']).map((tool) => tool.name);
    expect(write).not.toContain('delete_task');
    expect(write).not.toContain('restore_task');
    const trash = visibleTools(['tasks:trash']).map((tool) => tool.name);
    expect(trash).toEqual(expect.arrayContaining(['delete_task', 'restore_task']));
  });

  it('TTD-AUD-53: reopen/cancel are write-scoped', () => {
    const write = visibleTools(['tasks:write']).map((tool) => tool.name);
    expect(write).toEqual(
      expect.arrayContaining(['reopen_task', 'cancel_task', 'move_task', 'assign_task']),
    );
  });

  it('TTD-AUD-52: reminder tools require reminders:write', () => {
    const read = visibleTools(['tasks:read']).map((tool) => tool.name);
    expect(read).toContain('list_task_reminders');
    expect(read).not.toContain('add_task_reminder');
    const write = visibleTools(['reminders:write']).map((tool) => tool.name);
    expect(write).toEqual(expect.arrayContaining(['add_task_reminder', 'delete_task_reminder']));
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

  it('RF-2007..RF-2011: recurrence tools and schemas stay scoped and closed', () => {
    const read = visibleTools(['tasks:read']).map((tool) => tool.name);
    expect(read).toContain('get_task_occurrences');
    expect(read).not.toContain('detach_occurrence');
    expect(read).not.toContain('create_task');

    const write = visibleTools(['tasks:write']).map((tool) => tool.name);
    expect(write).toEqual(
      expect.arrayContaining(['create_task', 'update_task', 'complete_task', 'detach_occurrence']),
    );
    expect(write).not.toContain('get_task_occurrences');

    for (const name of [
      'create_task',
      'update_task',
      'complete_task',
      'get_task_occurrences',
      'detach_occurrence',
    ]) {
      const tool = MCP_TOOLS.find((item) => item.name === name);
      expect(tool?.inputSchema.additionalProperties).toBe(false);
    }

    const create = MCP_TOOLS.find((item) => item.name === 'create_task');
    expect(create?.inputSchema.properties).toHaveProperty('recurrence');
    expect(create?.inputSchema.properties).toHaveProperty('repeat_rule');
    expect(create?.inputSchema.properties).toHaveProperty('repeat_from');
    expect(create?.description).toContain('recurrence');

    const complete = MCP_TOOLS.find((item) => item.name === 'complete_task');
    expect(complete?.inputSchema.properties).toHaveProperty('advance');
    expect(complete?.inputSchema.properties).toHaveProperty('materialize_next');
    expect(complete?.description).toContain('next_future');
  });

  it('TTD-AUD-48/49: create_task exposes tags and quick_add is listed', () => {
    const create = MCP_TOOLS.find((item) => item.name === 'create_task');
    expect(create?.inputSchema.properties).toHaveProperty('tag_ids');
    expect(create?.inputSchema.properties).toHaveProperty('tags');
    expect(create?.inputSchema.properties).toHaveProperty('parse');
    expect(create?.inputSchema.properties).toHaveProperty('content');
    const update = MCP_TOOLS.find((item) => item.name === 'update_task');
    expect(update?.inputSchema.properties).toHaveProperty('add_tag_ids');
    expect(update?.inputSchema.properties).toHaveProperty('remove_tag_ids');
    expect(MCP_TOOLS.some((tool) => tool.name === 'quick_add')).toBe(true);
    expect(visibleTools(['tasks:write']).map((tool) => tool.name)).toContain('quick_add');
  });

  it('lists folders and project state on lists scopes', () => {
    const read = visibleTools(['lists:read']).map((tool) => tool.name);
    const write = visibleTools(['lists:write']).map((tool) => tool.name);
    expect(read).toEqual(expect.arrayContaining(['list_folders', 'list_projects']));
    const writing = [
      'create_folder',
      'update_folder',
      'delete_folder',
      'update_project',
      'set_project_state',
      'archive_project',
      'unarchive_project',
      'delete_project',
      'create_project',
    ];
    for (const name of writing) {
      expect(read, name).not.toContain(name);
      expect(write, name).toContain(name);
    }
    const listed = MCP_TOOLS.find((tool) => tool.name === 'list_projects');
    expect(listed?.scopes).toEqual(['lists:read']);
    expect(listed?.inputSchema.properties).toHaveProperty('folder_id');
    expect(listed?.inputSchema.properties).toHaveProperty('is_project');
    expect(listed?.inputSchema.properties).toHaveProperty('state');
    expect(listed?.inputSchema.properties).toHaveProperty('include_closed');
    expect(listed?.inputSchema.additionalProperties).toBe(false);
    const created = MCP_TOOLS.find((tool) => tool.name === 'create_project');
    expect(created?.inputSchema.required).toEqual(['name']);
    expect(created?.inputSchema.properties).toHaveProperty('folder_id');
    expect(created?.inputSchema.properties).toHaveProperty('is_project');
    expect(created?.inputSchema.properties).toHaveProperty('outcome');
    expect(created?.inputSchema.additionalProperties).toBe(false);
    for (const name of [
      'list_folders',
      'create_folder',
      'update_folder',
      'delete_folder',
      'update_project',
      'set_project_state',
      'archive_project',
      'unarchive_project',
      'delete_project',
    ]) {
      const tool = MCP_TOOLS.find((item) => item.name === name);
      expect(tool?.inputSchema.additionalProperties, name).toBe(false);
    }
    expect(MCP_TOOLS.find((tool) => tool.name === 'delete_folder')?.description).toBe(
      'Delete a folder. Its lists move to no folder; no list or task is deleted.',
    );
    expect(MCP_TOOLS.find((tool) => tool.name === 'set_project_state')?.description).toContain(
      'Archiving archives the list.',
    );
    const overview = MCP_TOOLS.find((tool) => tool.name === 'list_project_overview');
    expect(overview?.scopes).toEqual(['lists:read', 'tasks:read']);
    expect(overview?.description).toContain('Proyectos kanban');
    expect(overview?.inputSchema.properties).toHaveProperty('state');
    expect(overview?.inputSchema.properties).toHaveProperty('limit');
    expect(visibleTools(['lists:read', 'tasks:read']).map((tool) => tool.name)).toContain(
      'list_project_overview',
    );
    const reviewed = MCP_TOOLS.find((tool) => tool.name === 'mark_project_reviewed');
    expect(reviewed?.scopes).toEqual(['lists:write']);
    expect(reviewed?.inputSchema.required).toEqual(['ids']);
    expect(visibleTools(['lists:read']).map((tool) => tool.name)).not.toContain(
      'mark_project_reviewed',
    );
  });
});

it('TTD-AUD-82: cancellation explains history, reopening and trash separately', () => {
  const tool = MCP_TOOLS.find((tool) => tool.name === 'cancel_task');
  expect(tool?.description).toContain('hidden from lists, kept in history');
  expect(tool?.description).toContain('reopen_task');
  expect(tool?.description).toContain('restore_task');
});

it('TTD-AUD-83: every list tool declares limit and opaque cursor', () => {
  for (const tool of MCP_TOOLS.filter((tool) => tool.name.startsWith('list_'))) {
    expect(tool.inputSchema.properties, tool.name).toHaveProperty('cursor');
    expect(tool.inputSchema.properties, tool.name).toHaveProperty('limit');
  }
  const catalog = MCP_TOOLS.find((tool) => tool.name === 'api_catalog');
  expect(catalog?.inputSchema.properties.cursor).toMatchObject({ type: 'string' });
});
