import { describe, expect, it } from 'vitest';
import { API_PREFIX } from './config';

describe('web config', () => {
  it('points the client at the public API', () => {
    expect(API_PREFIX).toBe('/api/v1');
  });
});
