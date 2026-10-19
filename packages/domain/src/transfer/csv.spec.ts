import { describe, expect, it } from 'vitest';
import { mapCsv, tasksToCsv } from './csv';

describe('csv', () => {
  it('RF-1702: maps columns, spanish priority and quoted commas', () => {
    const parsed = mapCsv(
      'titulo,notas,vence,prio,etiquetas,lista\r\n"Comprar, leche",casa,2026-10-18T18:00:00.000Z,alta,casa;trabajo,Personal\r\n',
      {
        title: 'titulo',
        content: 'notas',
        due: 'vence',
        priority: 'prio',
        tags: 'etiquetas',
        list: 'lista',
      },
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.tasks[0]?.title).toBe('Comprar, leche');
      expect(parsed.tasks[0]?.priority).toBe('high');
      expect(parsed.tasks[0]?.tags).toEqual(['casa', 'trabajo']);
    }
  });

  it('RF-1702: rejects an empty file, a missing title column and a blank title', () => {
    expect(mapCsv('', { title: 'titulo' }).ok).toBe(false);
    expect(mapCsv('otra\nvacio', { title: 'titulo' })).toMatchObject({
      reason: 'missing_title_column',
    });
    expect(mapCsv('titulo,notas\n,casa', { title: 'titulo' })).toMatchObject({
      reason: 'empty_title',
    });
  });

  it('RF-1702: accepts TickTick priority numbers and ignores an unknown priority', () => {
    const parsed = mapCsv('titulo,prio\nUna,5\nDos,rara', { title: 'titulo', priority: 'prio' });
    expect(parsed.ok && parsed.tasks.map((task) => task.priority)).toEqual(['high', 'none']);
  });

  it('RF-1703: writes a list as CSV', () => {
    const csv = tasksToCsv([
      {
        title: 'Hola, mundo',
        content: 'a',
        dueDate: null,
        priority: 'low',
        tags: ['casa'],
        listName: 'Inbox',
        status: 'active',
      },
    ]);
    expect(csv).toContain('"Hola, mundo"');
    expect(csv.startsWith('title,content,due,priority,tags,list,status')).toBe(true);
  });

  it('S-18: neutralizes formula cells', () => {
    const csv = tasksToCsv([
      {
        title: '=HYPERLINK("http://example.test")',
        content: '+cmd',
        dueDate: null,
        priority: 'none',
        tags: [],
        listName: '-list',
        status: 'active',
      },
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'-list");
  });
});
