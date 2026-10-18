import { matchesFilter, type FilterClock, type FilterSubject } from '../filters/clause';
import { isPriority } from '../priority/priority';
import type { FilterRules, Priority } from '../types';

/** RF section 11.3. Actions the engine knows before plugins add their own. */
export type AutomationAction =
  | { readonly type: 'add_tag'; readonly tag: string }
  | { readonly type: 'remove_tag'; readonly tag: string }
  | { readonly type: 'set_priority'; readonly priority: Priority }
  | { readonly type: 'move_to_list'; readonly project: string }
  | { readonly type: 'reschedule'; readonly due: string }
  | { readonly type: 'create_task'; readonly project: string; readonly title: string }
  | { readonly type: 'notify'; readonly channel: string; readonly text: string }
  | { readonly type: 'webhook'; readonly url: string }
  | { readonly type: 'run_plugin_action'; readonly plugin_id: string; readonly action: string };

export interface AutomationRule {
  readonly name: string;
  readonly trigger:
    | { readonly event: string }
    | { readonly cron: string }
    | { readonly date_arrived: true };
  readonly conditions: FilterRules | null;
  readonly actions: readonly AutomationAction[];
}

export function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) => {
    return vars[key] ?? match;
  });
}

export function automationMatches(
  conditions: FilterRules | null,
  subject: FilterSubject,
  clock: FilterClock,
): boolean {
  if (conditions === null) {
    return true;
  }
  return matchesFilter(conditions, subject, clock);
}

export function parseAutomationAction(value: unknown): AutomationAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }
  switch (value.type) {
    case 'add_tag':
    case 'remove_tag':
      return typeof value.tag === 'string' && value.tag.length > 0
        ? { type: value.type, tag: value.tag }
        : null;
    case 'set_priority':
      return typeof value.priority === 'string' && isPriority(value.priority)
        ? { type: 'set_priority', priority: value.priority }
        : null;
    case 'move_to_list':
      return typeof value.project === 'string' && value.project.length > 0
        ? { type: 'move_to_list', project: value.project }
        : null;
    case 'reschedule':
      return typeof value.due === 'string' && !Number.isNaN(Date.parse(value.due))
        ? { type: 'reschedule', due: value.due }
        : null;
    case 'create_task':
      return typeof value.project === 'string' &&
        typeof value.title === 'string' &&
        value.title.length > 0
        ? { type: 'create_task', project: value.project, title: value.title }
        : null;
    case 'notify':
      return typeof value.channel === 'string' && typeof value.text === 'string'
        ? { type: 'notify', channel: value.channel, text: value.text }
        : null;
    case 'webhook':
      return typeof value.url === 'string' && value.url.startsWith('https://')
        ? { type: 'webhook', url: value.url }
        : null;
    case 'run_plugin_action':
      return typeof value.plugin_id === 'string' && typeof value.action === 'string'
        ? { type: 'run_plugin_action', plugin_id: value.plugin_id, action: value.action }
        : null;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
