import { describe, expect, it } from 'vitest';
import { applyFormat } from './format-note';

describe('applyFormat', () => {
  it('wraps the selection in bold markers', () => {
    const result = applyFormat('hola mundo', 5, 10, 'bold');
    expect(result.value).toBe('hola **mundo**');
    expect(result).toMatchObject({ start: 7, end: 12 });
  });

  it('removes bold markers when the selection is already wrapped', () => {
    const result = applyFormat('hola **mundo**', 7, 12, 'bold');
    expect(result.value).toBe('hola mundo');
  });

  it('prefixes each selected line as a task list', () => {
    const result = applyFormat('uno\ndos', 0, 7, 'check');
    expect(result.value).toBe('- [ ] uno\n- [ ] dos');
  });

  it('inserts a date at the caret', () => {
    const result = applyFormat('nota', 4, 4, 'date', '19 oct 2026');
    expect(result.value).toBe('nota\n19 oct 2026\n');
  });

  it('turns the selection into a link and selects the url', () => {
    const result = applyFormat('lee esto', 4, 8, 'link');
    expect(result.value).toBe('lee [esto](https://)');
    expect(result.value.slice(result.start, result.end)).toBe('https://');
  });
});
