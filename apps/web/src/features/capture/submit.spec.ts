import { describe, expect, it } from 'vitest';
import { listCaptureBody, todayCaptureBody } from './submit';

const now = new Date('2026-10-18T10:00:00.000Z');

describe('quick add bodies', () => {
  it('adds today when the parser finds no date, and leaves an explicit date alone', () => {
    const bare = todayCaptureBody('Regar', now, 'Europe/Madrid', 'es');
    expect(bare.raw_text).toBe('Regar');
    expect(bare.title).toBeUndefined();
    expect(bare.project_id).toBeUndefined();
    expect(bare.due_date).toBe('2026-10-17T22:00:00.000Z');
    expect(bare.is_all_day).toBe(true);

    const dated = todayCaptureBody('Regar ^Casa #casa !baja mañana', now, 'Europe/Madrid', 'es');
    expect(dated).toEqual({ raw_text: 'Regar ^Casa #casa !baja mañana' });
  });

  it('keeps a list task in that list and does not force today', () => {
    expect(listCaptureBody('Informe #trabajo !alta mañana', 'list-1')).toEqual({
      raw_text: 'Informe #trabajo !alta mañana',
      project_id: 'list-1',
    });
  });
});
