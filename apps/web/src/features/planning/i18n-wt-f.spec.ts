import { expect, it } from 'vitest';
import { wtFMessages } from './i18n-wt-f';
it('F-AC-28: both languages have complete nonempty copy and the approved labels', () => {
  expect(Object.keys(wtFMessages.es).sort()).toEqual(Object.keys(wtFMessages.en).sort());
  for (const messages of Object.values(wtFMessages))
    for (const text of Object.values(messages)) expect(text.trim().length).toBeGreaterThan(0);
  expect(wtFMessages.es.title).toBe('Planifica tu día');
  expect(wtFMessages.es.unchanged).toBe(
    'Aún no se ha cambiado nada. Confirma cuando te parezca bien.',
  );
});
