import { describe, expect, it } from 'vitest';
import { normalizeStoredNewlines } from './newlines';

describe('normalizeStoredNewlines', () => {
  it('turns a doubly escaped note into real breaks and a list', () => {
    expect(normalizeStoredNewlines('Quedar por la tarde.\\n\\n- Comprar la tarta')).toBe(
      'Quedar por la tarde.\n\n- Comprar la tarta',
    );
  });

  it('keeps real newlines and a literal backslash-n the author typed', () => {
    const value = 'Primera línea\nSegunda línea\n- lista\nLiteral: \\n';
    expect(normalizeStoredNewlines(value)).toBe(value);
  });

  it('leaves a single mention on one line alone', () => {
    expect(normalizeStoredNewlines('El carácter es \\n')).toBe('El carácter es \\n');
  });

  it('is idempotent once the note has real breaks', () => {
    const once = normalizeStoredNewlines('Hola\\n\\n- uno');
    expect(normalizeStoredNewlines(once)).toBe('Hola\n\n- uno');
  });
});
