import { describe, expect, it } from 'vitest';
import { API_PREFIX, DEV_USER_EMAIL } from './config';

describe('web config', () => {
  it('points the client at the public API', () => {
    expect(API_PREFIX).toBe('/api/v1');
  });

  it('uses the seeded development user until PATs exist', () => {
    expect(DEV_USER_EMAIL).toBe('demo@reflexionia.test');
  });
});
