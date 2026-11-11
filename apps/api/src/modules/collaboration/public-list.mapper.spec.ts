import { describe, expect, it } from 'vitest';
import { assertPublicShape, toPublicList } from './public-list.mapper.js';

describe('public list mapper', () => {
  it('COMP-29: the body only contains the public keys', () => {
    const body = toPublicList(
      'Compra',
      [
        {
          title: 'Leche',
          content: 'entera',
          status: 'active',
          priority: 'low',
          startDate: null,
          dueDate: null,
          isAllDay: false,
          completedAt: null,
          tags: [{ name: 'casa', color: '#abc' }],
          subtasks: [{ title: 'desnatada', status: 'active' }],
          checklist: [{ title: 'pagar', done: false }],
        },
      ],
      false,
      false,
      new Date('2026-10-29T12:00:00.000Z'),
    );
    expect(body.tasks[0]?.notes).toBeNull();
    expect(() => {
      assertPublicShape(body);
    }).not.toThrow();
    expect(JSON.stringify(body)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});
