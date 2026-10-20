import { describe, expect, it } from 'vitest';
import { displayTitle, looksLikeUuid } from './displayTitle';

describe('displayTitle', () => {
  it('TSK-4: drops a hashtag that is already a chip', () => {
    expect(displayTitle('Llamar a Ana #casa mañana', ['casa'])).toBe('Llamar a Ana mañana');
  });

  it('TSK-4: strips unknown hashtags from the visible title', () => {
    expect(displayTitle('Revisar #borrador', ['casa'])).toBe('Revisar');
  });

  it('TSK-4: strips several trailing tags', () => {
    expect(displayTitle('Pagar asistenta #casa #personal #gestion', [])).toBe('Pagar asistenta');
  });

  it('EXT-9: detects raw UUID labels', () => {
    expect(looksLikeUuid('67272402-1234-4111-8111-1234567890ab')).toBe(true);
    expect(looksLikeUuid('Pagar asistenta')).toBe(false);
  });
});
