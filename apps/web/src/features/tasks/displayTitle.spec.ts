import { describe, expect, it } from 'vitest';
import { displayTitle, looksLikeUuid } from './displayTitle';

describe('displayTitle', () => {
  it('RF-102: preserves a tag intentionally retained by capture settings', () => {
    expect(displayTitle('Llamar a Ana #casa mañana', ['casa'])).toBe('Llamar a Ana #casa mañana');
  });

  it('RF-102: leaves literal hashtags unchanged when recognition is disabled', () => {
    expect(displayTitle('Revisar #borrador', ['casa'])).toBe('Revisar #borrador');
  });

  it('RF-102: does not perform a second cleanup on a persisted title', () => {
    expect(displayTitle('Pagar asistenta #casa #personal #gestion', [])).toBe(
      'Pagar asistenta #casa #personal #gestion',
    );
  });

  it('EXT-9: detects raw UUID labels', () => {
    expect(looksLikeUuid('67272402-1234-4111-8111-1234567890ab')).toBe(true);
    expect(looksLikeUuid('Pagar asistenta')).toBe(false);
  });
});
