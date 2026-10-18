import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from './navigation';

describe('navigation', () => {
  it('UI-101: every mapped screen has a stable path', () => {
    const paths = APP_ROUTES.map((route) => route.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/today',
        '/quick-add',
        '/inbox',
        '/list/:id',
        '/smart/:key',
        '/task/:id',
        '/habits',
        '/calendar/:view',
        '/search',
        '/settings/appearance',
      ]),
    );
  });
});
