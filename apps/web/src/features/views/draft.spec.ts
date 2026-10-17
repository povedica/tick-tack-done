import { describe, expect, it } from 'vitest';
import { rulesWithOuter, type GroupDraft } from './draft';

const keyword: GroupDraft = {
  combinator: 'OR',
  conditions: [{ field: 'keyword', op: 'contains', value: '  informe  ', valueTo: '' }],
};

describe('filter draft', () => {
  it('RF-902: normal mode is one AND group and advanced mode keeps OR', () => {
    expect(rulesWithOuter('normal', 'OR', [keyword, keyword])).toEqual({
      combinator: 'AND',
      groups: [
        {
          combinator: 'AND',
          conditions: [{ field: 'keyword', op: 'contains', value: 'informe' }],
        },
      ],
    });
    expect(
      rulesWithOuter('advanced', 'OR', [
        keyword,
        {
          combinator: 'AND',
          conditions: [{ field: 'date', op: 'today', value: '', valueTo: '' }],
        },
      ]).combinator,
    ).toBe('OR');
  });
});
