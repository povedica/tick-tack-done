import { describe, expect, it } from 'vitest';
import { messagesFor } from '../../i18n';
import { controlDeductionText } from './control-deduction';

describe('TTD-AUD-27: structured Control reasons', () => {
  it.each([
    [
      { code: 'overdue', params: { count: 2, oldCount: 0, points: 3 } },
      '2 overdue tasks: -3 in Tasks',
    ],
    [
      { code: 'overdue', params: { count: 2, oldCount: 2, points: 6 } },
      '2 overdue tasks over 30 days old: -6 in Tasks',
    ],
    [
      { code: 'on_time', params: { actual: 0, target: 5 } },
      'On-time tasks: 0/5 in the last 14 days',
    ],
    [{ code: 'habits', params: { actual: 2, target: 3 } }, 'Habits: 2/3 scheduled days completed'],
    [{ code: 'focus', params: { actual: 6, target: 10 } }, 'Focus: 6/10 pomodoros this week'],
    [{ code: 'usage', params: { actual: 4, target: 7 } }, 'Use: 4/7 recorded days'],
  ])('formats %j without depending on the server wording', (reason, expected) => {
    expect(controlDeductionText(reason, messagesFor('en'), 'en')).toBe(expected);
  });
  it('formats Spanish and rejects unknown or malformed reasons', () => {
    expect(
      controlDeductionText(
        { code: 'usage', params: { actual: 4, target: 7 } },
        messagesFor('es'),
        'es',
      ),
    ).toBe('Uso: 4/7 días registrados');
    for (const value of [
      null,
      'frase del servidor',
      {},
      { code: 'new_code', params: {} },
      { code: 'focus', params: { actual: -1, target: 10 } },
      { code: 'usage', params: { actual: NaN, target: 7 } },
    ])
      expect(controlDeductionText(value, messagesFor('en'), 'en')).toBeNull();
  });
});
