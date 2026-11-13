import { describe, expect, it } from 'vitest';
import {
  BAKE_P95_MS,
  BAKE_P99_MS,
  bakeChoice,
  bakeSample,
  explainSql,
  explainTiming,
  percentile,
  rangeSql,
  summarySql,
  YEAR_FROM,
  YEAR_TO,
} from './b0-bake.js';

describe('calendar bake budgets', () => {
  it('picks B0 when the source-table year and month stay under section 6.2', () => {
    expect(BAKE_P95_MS).toBe(50);
    expect(BAKE_P99_MS).toBe(200);
    expect(
      bakeChoice({
        summary: { p95: 49.9, p99: 199.9 },
        range: { p95: 12, p99: 40 },
      }),
    ).toBe('B0');
    expect(
      bakeChoice({
        summary: { p95: 50, p99: 10 },
        range: { p95: 1, p99: 1 },
      }),
    ).toBe('over-budget');
  });

  it('uses the nearest rank on a sorted sample', () => {
    const sample = bakeSample([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    expect(sample.p95).toBe(100);
    expect(sample.p99).toBe(100);
  });

  it('reads local days and project color, and pages the month at 500', () => {
    const owner = '11111111-1111-1111-1111-111111111111';
    const summary = summarySql('source', owner);
    const range = rangeSql('source', owner, '2026-03-01', '2026-03-31');
    expect(summary.text).toContain('local_start_day');
    expect(summary.text).toContain('local_end_day');
    expect(summary.text).toContain('projects');
    expect(summary.text).not.toContain('raw');
    expect(summary.values).toEqual([owner, YEAR_FROM, YEAR_TO]);
    expect(range.text).toContain('LIMIT $4::int');
    expect(range.text).toContain('ORDER BY local_start_day, starts_at, id');
    expect(range.values[3]).toBe(500);
    expect(summarySql('bake', owner).text).toContain("e.kind = 'task'");
    expect(summarySql('bake', owner).text).toContain("e.kind = 'event'");
    expect(explainSql(range).text.startsWith('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)')).toBe(true);
  });

  it('reads planning and execution time from EXPLAIN JSON', () => {
    const timing = explainTiming([
      {
        'Planning Time': 1.5,
        'Execution Time': 8.25,
        Plan: {
          'Node Type': 'Aggregate',
          'Shared Hit Blocks': 42,
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Index Name': 'tasks_owner_local_start_day_idx',
              Plans: [
                {
                  'Node Type': 'Index Scan',
                  'Index Name': 'external_events_owner_local_start_day_idx',
                },
              ],
            },
          ],
        },
      },
    ]);
    expect(timing.totalMs).toBe(9.75);
    expect(timing.sharedHitBlocks).toBe(42);
    expect(timing.indexes).toEqual([
      'tasks_owner_local_start_day_idx',
      'external_events_owner_local_start_day_idx',
    ]);
  });
});
