import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';

describe('i18n', () => {
  it('P2-16: Spanish and English expose the same keys', () => {
    const english = Object.keys(en).sort();
    const spanish = Object.keys(es).sort();
    expect(spanish).toEqual(english);
  });
});
