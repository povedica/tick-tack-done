import { describe, expect, it } from 'vitest';
import { SDK_SOURCE } from './index';

describe('sdk', () => {
  it('keeps the client sourced from OpenAPI', () => {
    expect(SDK_SOURCE).toBe('openapi');
  });
});
