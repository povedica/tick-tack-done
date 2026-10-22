import { execFileSync } from 'node:child_process';
import { chmodSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
export function maintenanceMode(): { dryRun: boolean; backup: string | null } {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run') && args.includes('--apply'))
    throw new Error('Choose --dry-run or --apply');
  if (!args.includes('--dry-run') && !args.includes('--apply'))
    throw new Error('Use --dry-run or --apply --backup /private/path.dump');
  const index = args.indexOf('--backup');
  const backup = index < 0 ? null : (args[index + 1] ?? null);
  const dryRun = args.includes('--dry-run');
  if (!dryRun && (!backup || !path.isAbsolute(backup)))
    throw new Error('--apply requires an absolute --backup path');
  return { dryRun, backup };
}
export function backupBeforeApply(file: string): void {
  if (existsSync(file)) throw new Error('Backup path already exists; refusing to overwrite');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol))
    throw new Error('PostgreSQL DATABASE_URL required');
  process.umask(0o077);
  execFileSync('pg_dump', ['--format=custom', '--file', file], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
    },
  });
  chmodSync(file, 0o600);
  if (statSync(file).size === 0) throw new Error('Empty backup; refusing changes');
  execFileSync('pg_restore', ['--list', file], { stdio: 'ignore' });
}
