import { matchPath } from 'react-router';

/**
 * Absolute templates of the routes in `app.tsx`, including settings children.
 * `safePath` masks a URL by the template that matches it, the same way the router does.
 * A drift test fails when a `path` in `app.tsx` is missing here.
 */
export const ROUTE_TEMPLATES = [
  '/',
  '/privacy',
  '/terms',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/s/:token',
  '/today',
  '/quick-add',
  '/inbox',
  '/list/:id',
  '/list/:id/note/:taskId',
  '/projects/:id',
  '/lists/:id',
  '/filter/:id',
  '/filters',
  '/filters/:id',
  '/tag/:id',
  '/trash',
  '/tasks/completed',
  '/tasks/cancelled',
  '/smart/:key',
  '/smart-lists',
  '/smart-lists/:key',
  '/task/:id',
  '/habits',
  '/habits/:id',
  '/countdowns',
  '/calendar',
  '/calendar/:view',
  '/matrix',
  '/focus',
  '/dashboard',
  '/dashboard/projects',
  '/statistics',
  '/statistics/:tab',
  '/reports/weekly',
  '/reports/weekly/:week',
  '/plan/day',
  '/cierre',
  '/replan',
  '/wont-do',
  '/review',
  '/review/daily',
  '/review/weekly',
  '/search',
  '/ticky',
  '/sticky',
  '/tokens',
  '/oauth/consent',
  '/settings',
  '/settings/appearance',
  '/settings/features',
  '/settings/account',
  '/settings/workday',
  '/settings/capture',
  '/settings/focus',
  '/settings/about',
  '/settings/notifications',
  '/settings/smart-lists',
  '/settings/calendar',
  '/settings/tokens',
  '/settings/integrations',
  '/settings/automations',
  '/settings/webhooks',
  '/settings/data',
  '/settings/plugins',
  '/settings/sharing',
  '/settings/shortcuts',
  '/repeat',
] as const;

/** The router template for this pathname, or null when it is not a page route. */
export function routeTemplate(pathname: string): string | null {
  let best: string | null = null;
  for (const template of ROUTE_TEMPLATES) {
    if (matchPath({ path: template, end: true }, pathname) === null) continue;
    if (best === null || template.length > best.length) best = template;
  }
  return best;
}
