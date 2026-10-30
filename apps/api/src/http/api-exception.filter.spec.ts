import { describe, expect, it } from 'vitest';
import { maskPublicListPath } from './api-exception.filter.js';

describe('maskPublicListPath', () => {
  it('hides the public list token before it can reach a log', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABC';
    expect(maskPublicListPath(`/api/v1/public/lists/${token}`)).toBe('/api/v1/public/lists/:token');
    expect(maskPublicListPath(`/api/v1/public/lists/${token}`)).not.toContain(token);
  });
});
