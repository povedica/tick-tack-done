import type { QuickAddContext, QuickAddParse } from '../types';
import type { CaptureSettings } from './capture-settings';
import { parseQuickAdd, titleWithout, type QuickAddLanguage } from './parse';

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
