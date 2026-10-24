// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { es, en, telegramUiState } from './i18n-wt-c';
describe('RF-2003: mensajes y estado Telegram', () => {
  it('uses identical Spanish and English keys', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it.each(['none', 'token_saved', 'webhook_ok', 'linked', 'blocked', 'error'] as const)(
    'preserves API state %s',
    (state) => {
      expect(telegramUiState({ state })).toBe(state);
    },
  );
});
