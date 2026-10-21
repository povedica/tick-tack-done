import { describe, expect, it } from 'vitest';
import { collapseRepeatedContent } from './collapse-repeated';

describe('collapseRepeatedContent', () => {
  it('DET-5: collapses a fragment repeated many times', () => {
    const chunk = 'hola que tal ';
    const corrupted = chunk.repeat(20);
    const cleaned = collapseRepeatedContent(corrupted);
    expect(cleaned.length).toBeLessThan(corrupted.length / 2);
    expect(cleaned.startsWith('hola que tal')).toBe(true);
  });

  it('DET-5: leaves normal notes alone', () => {
    const note = 'Compra leche y pan. Luego llama a Ana.';
    expect(collapseRepeatedContent(note)).toBe(note);
  });
  it('DET-5: repair is idempotent and keeps internal repeated sections', () => {
    const repaired = collapseRepeatedContent('hola que tal '.repeat(20));
    expect(collapseRepeatedContent(repaired)).toBe(repaired);
    const note = `Introducción\n${'lista de compra\n'.repeat(6)}Conclusión diferente`;
    expect(collapseRepeatedContent(note)).toBe(note);
  });
});
