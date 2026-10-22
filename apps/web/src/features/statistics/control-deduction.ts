import type { Messages } from '../../i18n';

/** Accept the public reason codes, never parse a server sentence for translation. */
export function controlDeductionText(
  value: unknown,
  messages: Messages,
  locale: string,
): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reason = value as Record<string, unknown>;
  if (typeof reason.params !== 'object' || reason.params === null || Array.isArray(reason.params))
    return null;
  const params = reason.params as Record<string, unknown>;
  const number = new Intl.NumberFormat(locale);
  const format = (template: string, keys: readonly string[]): string | null => {
    let result = template;
    for (const key of keys) {
      const item = params[key];
      if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) return null;
      result = result.replace(`{${key}}`, number.format(item));
    }
    return result;
  };
  switch (reason.code) {
    case 'overdue':
      if (
        typeof params.oldCount !== 'number' ||
        !Number.isFinite(params.oldCount) ||
        params.oldCount < 0
      )
        return null;
      return format(
        params.count === params.oldCount && params.oldCount > 0
          ? messages.controlReasonOverdueOld
          : messages.controlReasonOverdue,
        ['count', 'points'],
      );
    case 'on_time':
      return format(messages.controlReasonOnTime, ['actual', 'target']);
    case 'habits':
      return format(messages.controlReasonHabits, ['actual', 'target']);
    case 'focus':
      return format(messages.controlReasonFocus, ['actual', 'target']);
    case 'usage':
      return format(messages.controlReasonUsage, ['actual', 'target']);
    default:
      return null;
  }
}
