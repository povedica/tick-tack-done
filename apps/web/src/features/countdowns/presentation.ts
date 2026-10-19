import type { Countdown, CountdownKind, CountdownType } from './api';

export const TYPE_LABEL: Record<CountdownType, string> = {
  countdown: 'Cuenta atrás',
  anniversary: 'Aniversario',
  birthday: 'Cumpleaños',
  holiday: 'Festivo',
};

export function dateLabel(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year === undefined || month === undefined || day === undefined
    ? value
    : `${day}/${month}/${year}`;
}

export function countdownLabel(kind: CountdownKind, days: number, effectiveDate: string): string {
  if (kind === 'today') return '¡Es hoy!';
  return `${kind === 'until' ? 'Faltan' : 'Han pasado'} ${String(days)} ${days === 1 ? 'día' : 'días'} · ${dateLabel(effectiveDate)}`;
}

export function countdownNumber(countdown: Pick<Countdown, 'kind' | 'days'>): string {
  return countdown.kind === 'today' ? '¡Hoy!' : String(countdown.days);
}

export function groupCountdowns(
  items: readonly Countdown[],
): readonly (readonly [CountdownType, readonly Countdown[]])[] {
  return (Object.keys(TYPE_LABEL) as CountdownType[])
    .map((type) => [type, items.filter((item) => item.type === type)] as const)
    .filter(([, entries]) => entries.length > 0);
}
