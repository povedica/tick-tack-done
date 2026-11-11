import type { Priority, QuickAddContext, QuickAddParse } from '../types';
import { parseQuickAdd, titleWithout, type QuickAddLanguage } from './parse';

export interface CaptureSettings {
  recognize_dates: boolean;
  remove_date_text: boolean;
  recognize_tags: boolean;
  remove_tag_text: boolean;
  parse_url_title: boolean;
  default_date: 'none' | 'today' | 'tomorrow';
  default_date_mode: 'date' | 'date_time';
  default_time: string;
  default_duration_minutes: number | null;
  default_priority: Priority;
  default_tag_id: string | null;
  default_list_id: string | null;
  timed_reminder: 'inherit' | 'none' | '-PT0M' | '-PT5M' | '-PT15M' | '-PT30M' | '-PT1H' | '-P1D';
  all_day_reminder: CaptureSettings['timed_reminder'];
  new_task_position: 'top' | 'bottom';
  overdue_position: 'top' | 'bottom';
}

/** Preserve existing capture behavior until the owner chooses different defaults. */
export const DEFAULT_CAPTURE_SETTINGS: Readonly<CaptureSettings> = {
  recognize_dates: true,
  remove_date_text: true,
  recognize_tags: true,
  remove_tag_text: true,
  parse_url_title: false,
  default_date: 'none',
  default_date_mode: 'date',
  default_time: '09:00',
  default_duration_minutes: null,
  default_priority: 'none',
  default_tag_id: null,
  default_list_id: null,
  timed_reminder: 'inherit',
  all_day_reminder: 'inherit',
  new_task_position: 'bottom',
  overdue_position: 'top',
};

export function captureSettings(value: unknown): CaptureSettings {
  const settings = { ...DEFAULT_CAPTURE_SETTINGS };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return settings;
  // Persisted settings are validated at the API boundary. Unknown fields are never propagated.
  for (const key of Object.keys(settings) as (keyof CaptureSettings)[]) {
    const next = (value as Record<string, unknown>)[key];
    if (next === undefined) continue;
    const valid =
      typeof settings[key] === 'boolean'
        ? typeof next === 'boolean'
        : key === 'default_duration_minutes'
          ? next === null ||
            (typeof next === 'number' && Number.isInteger(next) && next >= 1 && next <= 1440)
          : key === 'default_list_id' || key === 'default_tag_id'
            ? next === null || typeof next === 'string'
            : key === 'default_time'
              ? typeof next === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(next)
              : key === 'default_date'
                ? ['none', 'today', 'tomorrow'].includes(typeof next === 'string' ? next : '')
                : key === 'default_date_mode'
                  ? ['date', 'date_time'].includes(typeof next === 'string' ? next : '')
                  : key === 'default_priority'
                    ? ['none', 'low', 'medium', 'high'].includes(
                        typeof next === 'string' ? next : '',
                      )
                    : key.endsWith('_reminder')
                      ? [
                          'inherit',
                          'none',
                          '-PT0M',
                          '-PT5M',
                          '-PT15M',
                          '-PT30M',
                          '-PT1H',
                          '-P1D',
                        ].includes(typeof next === 'string' ? next : '')
                      : ['top', 'bottom'].includes(typeof next === 'string' ? next : '');
    if (valid) Object.assign(settings, { [key]: next });
  }
  return settings;
}

/** RF-102: recognition, title cleanup and fallback values share one implementation. */
export function parseCapture(
  text: string,
  language: QuickAddLanguage,
  context: QuickAddContext,
  settings: CaptureSettings,
): QuickAddParse {
  const parsed = parseQuickAdd(text, language, context);
  const spans = parsed.spans.filter(
    (span) =>
      (settings.recognize_dates || span.kind !== 'date') &&
      (settings.recognize_tags || span.kind !== 'tag'),
  );
  const removed = spans.filter((span) =>
    span.kind === 'date'
      ? settings.remove_date_text
      : span.kind === 'tag'
        ? settings.remove_tag_text
        : true,
  );
  const due = settings.recognize_dates ? parsed.due : null;
  const start = settings.recognize_dates ? parsed.start : null;
  const someday = settings.recognize_dates && parsed.someday;
  const fallback =
    due === null && start === null && !someday && settings.default_date !== 'none'
      ? parseQuickAdd(
          `${settings.default_date === 'today' ? 'hoy' : 'mañana'}${settings.default_date_mode === 'date_time' ? ` ${settings.default_time}` : ''}`,
          'es',
          context,
        ).due
      : null;
  return {
    ...parsed,
    spans,
    title: titleWithout(text, removed),
    due: due ?? fallback,
    start,
    someday,
    eveningOnly: settings.recognize_dates && parsed.eveningOnly,
    repeatRule: settings.recognize_dates ? parsed.repeatRule : null,
    tagNames: settings.recognize_tags ? parsed.tagNames : [],
    priority: parsed.priority ?? settings.default_priority,
    durationMinutes: parsed.durationMinutes ?? settings.default_duration_minutes,
  };
}
