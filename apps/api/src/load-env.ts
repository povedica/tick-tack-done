import { existsSync } from 'node:fs';
import path from 'node:path';

/** Loads the repo-root .env without overriding variables already set in the process. */
export function loadRootEnv(): void {
  const explicit = process.env.RUNTIME_ENV_FILE;
  if (explicit !== undefined && explicit.length > 0) {
    process.loadEnvFile(path.resolve(explicit));
    return;
  }
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
