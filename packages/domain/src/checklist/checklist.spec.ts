import { describe, expect, it } from 'vitest';
import { extractMarkdownChecklist } from './markdown';
import { checklistProgress } from './progress';

describe('checklist', () => {
  it('RF-202: lifts Markdown checkboxes out of the description', () => {
    const extracted = extractMarkdownChecklist(
      'Notas\n- [ ] comprar leche\n- [x] llamar\n* [X] enviar\n- [ ] \ntexto',
    );
    expect(extracted.items).toEqual([
      { title: 'comprar leche', status: 'active' },
      { title: 'llamar', status: 'completed' },
      { title: 'enviar', status: 'completed' },
    ]);
    expect(extracted.content).toBe('Notas\ntexto');
  });

  it('RF-202: leaves prose without checkboxes unchanged', () => {
    expect(extractMarkdownChecklist('solo texto\n- elemento').content).toBe(
      'solo texto\n- elemento',
    );
    expect(extractMarkdownChecklist('solo texto\n- elemento').items).toEqual([]);
  });

  it('RF-207: reports completed and total checklist items', () => {
    expect(
      checklistProgress([{ status: 'active' }, { status: 'completed' }, { status: 'completed' }]),
    ).toEqual({ completed: 2, total: 3 });
    expect(checklistProgress([])).toEqual({ completed: 0, total: 0 });
  });
});
