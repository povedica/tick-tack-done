import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROUTE_TEMPLATES, routeTemplate } from './route-templates';

describe('route templates', () => {
  it('covers every path in app.tsx, including the public list link', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'app.tsx'),
      'utf8',
    );
    const declared = [...source.matchAll(/path="([^"]+)"/g)].map((match) => match[1] ?? '');
    const templates = new Set<string>(ROUTE_TEMPLATES);
    const missing = declared.flatMap((path) => {
      if (path === '*') return [];
      const absolute = path.startsWith('/') ? path : `/settings/${path}`;
      return templates.has(absolute) ? [] : [absolute];
    });
    expect(missing).toEqual([]);
    expect(routeTemplate('/s/TRAMPA0123456789abcdef')).toBe('/s/:token');
  });
});
