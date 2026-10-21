/** Canonical module order, shared by account preferences and both shell variants. */
export const NAVIGATION_MODULES = [
  'calendar',
  'matrix',
  'countdowns',
  'focus',
  'habits',
  'ticky',
  'statistics',
  'dashboard',
  'reports',
  'review',
  'search',
] as const;

export type NavigationModule = (typeof NAVIGATION_MODULES)[number];

export function navigationOrder(value: unknown): NavigationModule[] {
  const known = Array.isArray(value)
    ? value.filter(
        (item): item is NavigationModule =>
          typeof item === 'string' && (NAVIGATION_MODULES as readonly string[]).includes(item),
      )
    : [];
  return [...new Set([...known, ...NAVIGATION_MODULES])];
}

export function moveNavigationModule(
  order: readonly NavigationModule[],
  source: NavigationModule,
  target: NavigationModule,
): NavigationModule[] {
  const normalized = navigationOrder(order);
  if (source === target) return normalized;
  const targetIndex = normalized.indexOf(target);
  const next = normalized.filter((item) => item !== source);
  next.splice(targetIndex, 0, source);
  return next;
}
