import { describe, expect, it } from 'vitest';
import { quickAddRequest } from './quick-add';

const now = '2026-10-18T10:00:00.000Z';
const timeZone = 'Europe/Madrid';

function day(iso: string | undefined): string | undefined {
  if (iso === undefined) {
    return undefined;
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

describe('quickAddRequest', () => {
  it('F1: a task added from Today is due today and stays in Inbox', () => {
    const request = quickAddRequest({
      text: 'Informe',
      language: 'es',
      now,
      timeZone,
      viewDay: 'today',
    });
    expect(request.body.raw_text).toBe('Informe');
    expect(request.body.project_id).toBeUndefined();
    expect(request.body.is_all_day).toBe(true);
    expect(day(request.dueDate ?? undefined)).toBe('2026-10-18');
  });

  it('F1: Tomorrow uses the next local day', () => {
    const request = quickAddRequest({
      text: 'Informe',
      language: 'es',
      now,
      timeZone,
      viewDay: 'tomorrow',
    });
    expect(day(request.dueDate ?? undefined)).toBe('2026-10-19');
  });

  it('F1: a natural date in the text is left for the parser', () => {
    const request = quickAddRequest({
      text: 'Informe mañana',
      language: 'es',
      now,
      timeZone,
      viewDay: 'today',
    });
    expect(request.dueDate).toBeNull();
    expect(request.parsed.due).not.toBeNull();
  });

  it('F1: Inbox does not invent a date and a named list is not overridden', () => {
    const inbox = quickAddRequest({
      text: 'Informe',
      language: 'es',
      now,
      timeZone,
      viewDay: null,
      defaultProjectId: '11111111-1111-4111-8111-111111111111',
    });
    expect(inbox.dueDate).toBeNull();
    expect(inbox.body.project_id).toBe('11111111-1111-4111-8111-111111111111');

    const named = quickAddRequest({
      text: 'Informe ^trabajo',
      language: 'es',
      now,
      timeZone,
      viewDay: null,
      defaultProjectId: '11111111-1111-4111-8111-111111111111',
    });
    expect(named.body.project_id).toBeUndefined();
    expect(named.parsed.listName).toBe('trabajo');
  });
});
