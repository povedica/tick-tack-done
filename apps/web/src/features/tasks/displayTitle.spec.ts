import { describe, expect, it } from 'vitest';
import { displayTitle } from './displayTitle';

describe('displayTitle', () => {
  it('drops a hashtag that is already a chip', () => {
    expect(displayTitle('Llamar a Ana #casa mañana', ['casa'])).toBe('Llamar a Ana mañana');
  });

  it('keeps a hashtag that is not a known tag', () => {
    expect(displayTitle('Revisar #borrador', ['casa'])).toBe('Revisar #borrador');
  });
});
