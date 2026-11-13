// Mobile Lighthouse for /calendar/year. Thresholds are R3 of #109:
// Performance ≥ 85, LCP ≤ 2.5 s, TBT ≤ 200 ms.
// Staging does not serve this branch. Measure vite preview plus
// scripts/perf/lighthouse-api.mjs. Pass LH_URL to measure another origin.
// The script exits 1 when R3 is missed. It is not wired into CI while the
// preview stays under these thresholds; the thresholds themselves stay.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const page = process.env.LH_URL ?? 'http://127.0.0.1:4174/calendar/year?date=2026-03-15';
const outDir = mkdtempSync(path.join(tmpdir(), 'ttd-lh-'));
const out = path.join(outDir, 'year.json');
const chrome = process.env.CHROME_PATH;

const args = [
  page,
  '--only-categories=performance',
  '--form-factor=mobile',
  '--screenEmulation.mobile',
  '--throttling-method=simulate',
  '--output=json',
  `--output-path=${out}`,
  '--quiet',
  '--chrome-flags=--headless=new --no-sandbox',
];
if (chrome !== undefined && chrome.length > 0) {
  args.push(`--chrome-path=${chrome}`);
}

const binary = process.env.LIGHTHOUSE_BIN ?? 'lighthouse';
const run = spawnSync(binary, args, { stdio: 'inherit' });
if (run.status !== 0) {
  process.stderr.write('lighthouse failed\n');
  process.exit(run.status ?? 1);
}

const report = JSON.parse(readFileSync(out, 'utf8'));
const score = Number(report.categories?.performance?.score);
const lcp = Number(report.audits?.['largest-contentful-paint']?.numericValue);
const tbt = Number(report.audits?.['total-blocking-time']?.numericValue);
const summary = {
  url: page,
  performance: Math.round(score * 100),
  lcpMs: Math.round(lcp),
  tbtMs: Math.round(tbt),
};
process.stdout.write(`${JSON.stringify(summary)}\n`);

const failures = [];
if (!(score >= 0.85)) failures.push(`performance ${summary.performance} < 85`);
if (!(lcp <= 2500)) failures.push(`LCP ${summary.lcpMs} ms > 2500`);
if (!(tbt <= 200)) failures.push(`TBT ${summary.tbtMs} ms > 200`);
if (failures.length > 0) {
  process.stderr.write(`${failures.join('; ')}\n`);
  process.exit(1);
}
