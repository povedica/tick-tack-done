import { describe, expect, it } from 'vitest';
import { countdownLabel, countdownNumber, dateLabel } from './presentation';

describe('countdown presentation', () => {
  it('RF-2451: presenta los días y la fecha en español', () => {
    expect(dateLabel('2026-12-31')).toBe('31/12/2026');
    expect(countdownLabel('until', 3, '2026-12-31')).toBe('Faltan 3 días · 31/12/2026');
    expect(countdownLabel('since', 1, '2026-01-01')).toBe('Han pasado 1 día · 01/01/2026');
  });

  it('RF-2451: destaca el día de la fecha', () => {
    expect(countdownLabel('today', 0, '2026-10-19')).toBe('¡Es hoy!');
    expect(countdownNumber({ kind: 'today', days: 0 })).toBe('¡Hoy!');
  });
});
