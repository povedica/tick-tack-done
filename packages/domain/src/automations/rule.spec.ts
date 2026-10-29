import { describe, expect, it } from 'vitest';
import { automationMatches, parseAutomationAction, renderTemplate } from './rule';

const clock = { now: '2026-10-18T12:00:00.000Z', timeZone: 'Europe/Madrid' };
const subject = {
  listId: 'list-1',
  tagIds: [],
  tagNames: ['casa'],
  dueDate: '2026-10-17T00:00:00.000Z',
  isAllDay: false,
  timeZone: 'Europe/Madrid',
  priority: 'high',
  title: 'Informe',
  content: '',
  status: 'active',
  assigneeId: null,
  deleted: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('automations', () => {
  it('renders task templates and leaves unknown keys', () => {
    expect(
      renderTemplate('Replanificar {{task.title}} {{now}}', {
        'task.title': 'Informe',
        now: 'hoy',
      }),
    ).toBe('Replanificar Informe hoy');
    expect(renderTemplate('{{missing}}', {})).toBe('{{missing}}');
  });

  it('matches the filter grammar and passes when there are no conditions', () => {
    expect(automationMatches(null, subject, clock)).toBe(true);
    expect(
      automationMatches(
        {
          combinator: 'AND',
          groups: [
            { combinator: 'AND', conditions: [{ field: 'priority', op: 'gte', value: 'medium' }] },
          ],
        },
        subject,
        clock,
      ),
    ).toBe(true);
  });

  it('parses the minimum actions and rejects a webhook that is not https', () => {
    expect(parseAutomationAction({ type: 'add_tag', tag: 'revisar' })).toEqual({
      type: 'add_tag',
      tag: 'revisar',
    });
    expect(parseAutomationAction({ type: 'set_priority', priority: 'high' })?.type).toBe(
      'set_priority',
    );
    expect(parseAutomationAction({ type: 'webhook', url: 'http://example.test' })).toBeNull();
    expect(
      parseAutomationAction({ type: 'create_task', project: 'Inbox', title: 'Mirar' })?.type,
    ).toBe('create_task');
    expect(parseAutomationAction({ type: 'nope' })).toBeNull();
    expect(parseAutomationAction(null)).toBeNull();
    expect(parseAutomationAction({ type: 'notify', channel: 'push', text: 'Hola' })?.type).toBe(
      'notify',
    );
    expect(parseAutomationAction({ type: 'move_to_list', project: 'Inbox' })?.type).toBe(
      'move_to_list',
    );
    expect(
      parseAutomationAction({ type: 'reschedule', due: '2026-10-19T00:00:00.000Z' })?.type,
    ).toBe('reschedule');
    expect(parseAutomationAction({ type: 'remove_tag', tag: '' })).toBeNull();
    expect(
      parseAutomationAction({ type: 'run_plugin_action', plugin_id: 'com.pablo.x', action: 'ping' })
        ?.type,
    ).toBe('run_plugin_action');
  });
});
