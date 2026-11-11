import { describe, expect, it } from 'vitest';
import { captureSeed } from './capture-seed';

describe('captureSeed', () => {
  it('DA-12: preloads one tag, one list and today', () => {
    expect(
      captureSeed({
        combinator: 'AND',
        groups: [
          {
            combinator: 'AND',
            conditions: [
              { field: 'tag', op: 'any_of', value: ['casa'] },
              { field: 'list', op: 'in', value: ['hogar'] },
              { field: 'date', op: 'today' },
            ],
          },
        ],
      }),
    ).toEqual({ projectId: 'hogar', tagIds: ['casa'], viewDay: 'today' });
  });

  it('DA-12: skips the preload when a field has more than one value', () => {
    expect(
      captureSeed({
        combinator: 'AND',
        groups: [
          {
            combinator: 'AND',
            conditions: [
              { field: 'tag', op: 'any_of', value: ['casa', 'alta'] },
              { field: 'date', op: 'between', value: ['2026-01-01', '2026-01-02'] },
            ],
          },
        ],
      }),
    ).toEqual({ tagIds: [], viewDay: null });
  });
});
