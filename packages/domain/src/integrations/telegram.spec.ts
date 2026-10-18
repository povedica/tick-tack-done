import { describe, expect, it } from 'vitest';
import { matchTaskByTitle, parseTelegramCommand } from './telegram';

describe('telegram commands', () => {
  it('RF-2003: keeps the capture and list commands', () => {
    expect(parseTelegramCommand('/hoy')).toEqual({ kind: 'today' });
    expect(parseTelegramCommand('/manana')).toEqual({ kind: 'tomorrow' });
    expect(parseTelegramCommand('/semana')).toEqual({ kind: 'week' });
    expect(parseTelegramCommand('/lista')).toEqual({ kind: 'lists' });
    expect(parseTelegramCommand('/lista #compra')).toEqual({ kind: 'tag', name: 'compra' });
    expect(parseTelegramCommand('/lista !alta')).toEqual({ kind: 'priority', level: 'high' });
    expect(parseTelegramCommand('/capturar comprar leche mañana')).toEqual({
      kind: 'capture',
      text: 'comprar leche mañana',
    });
    expect(parseTelegramCommand('/add call Ana')).toEqual({ kind: 'capture', text: 'call Ana' });
    expect(parseTelegramCommand('comprar pan')).toEqual({ kind: 'capture', text: 'comprar pan' });
  });

  it('RF-2003: completing names a title and never a UUID', () => {
    expect(parseTelegramCommand('/hecho comprar leche')).toEqual({
      kind: 'complete',
      query: 'comprar leche',
    });
    expect(parseTelegramCommand('completar 2')).toEqual({ kind: 'complete', query: '2' });
  });

  it('RF-2003: a title match is unique, ambiguous, or missing', () => {
    const tasks = [
      { id: 'a', title: 'Comprar leche' },
      { id: 'b', title: 'Comprar pan' },
    ];
    expect(matchTaskByTitle(tasks, 'comprar leche')).toEqual({
      status: 'one',
      id: 'a',
      title: 'Comprar leche',
    });
    expect(matchTaskByTitle(tasks, '2')).toEqual({
      status: 'one',
      id: 'b',
      title: 'Comprar pan',
    });
    expect(matchTaskByTitle(tasks, 'comprar')).toEqual({
      status: 'many',
      titles: ['Comprar leche', 'Comprar pan'],
    });
    expect(matchTaskByTitle(tasks, 'yoga')).toEqual({ status: 'none' });
  });
});
