// @vitest-environment jsdom
import { ApiError } from '@reflexionia/sdk';
import { describe, expect, it, vi } from 'vitest';
import { kanbanMovePatch } from './TaskList';
import { kanbanMoveError } from './KanbanMoveSheet';
vi.mock('./TaskComposer', () => ({ TaskComposer: () => null }));
describe('RF-204 RF-1002 TTD-AUD-110 moves', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  it('uses the column PATCH including the unassigned column', () => {
    expect(kanbanMovePatch('column', false, null, now)).toEqual({ column_id: 'column' });
    expect(kanbanMovePatch('none', false, null, now)).toEqual({ column_id: null });
  });
  it('uses the same all-day date bucket patch as drag and drop', () => {
    expect(kanbanMovePatch('today', true, null, now)).toEqual({
      due_date: '2026-10-22T00:00:00.000Z',
      is_all_day: true,
    });
    expect(kanbanMovePatch('tomorrow', true, null, now)).toEqual({
      due_date: '2026-10-23T00:00:00.000Z',
      is_all_day: true,
    });
    expect(kanbanMovePatch('nodate', true, null, now)).toEqual({
      due_date: null,
      is_all_day: true,
    });
  });
  it('preserves WIP errors without treating every failure as a WIP limit', () => {
    const labels = { wipExceeded: 'Límite WIP', saveFailed: 'No se guardó' };
    expect(kanbanMoveError(new ApiError(409, 'wip_exceeded', 'WIP'), labels)).toBe(
      labels.wipExceeded,
    );
    expect(kanbanMoveError(new Error('offline'), labels)).toBe(labels.saveFailed);
  });
});
