import { execFileSync, spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const base = process.env.FORMAT_BASE_SHA ?? '';
if (
  process.env.CI &&
  process.env.GITHUB_EVENT_NAME === 'pull_request' &&
  /^[a-f0-9]{40}$/i.test(base)
) {
  if (spawnSync('git', ['cat-file', '-e', `${base}^{commit}`], { stdio: 'ignore' }).status !== 0) {
    run('git', ['fetch', '--no-tags', '--depth=1', 'origin', base]);
  }
  const files = execFileSync(
    'git',
    ['diff', '--name-only', '-z', '--diff-filter=ACMR', base, 'HEAD'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  if (files.length === 0) console.log('No added or modified files to format');
  else run('pnpm', ['exec', 'prettier', '--check', '--ignore-unknown', '--', ...files]);
} else {
  // Main and local commands still check the complete tree.
  run('pnpm', ['exec', 'prettier', '--check', '.']);
}
