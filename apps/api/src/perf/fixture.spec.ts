import { describe, expect, it } from 'vitest';
import {
  assertEphemeralDatabase,
  baselineOpens,
  buildPerfFixture,
  civilDay,
  eventCoversDay,
  PROFILE_S,
  PROFILE_X100,
  requestsPerYearOpen,
  SENTINEL_DAY,
  SENTINEL_TITLE,
  yearWindow,
  PRODUCTION_RATE_LIMIT,
} from './fixture.js';

describe('perf fixture', () => {
  it('x100 matches the seed contract and stays inside the production rate limit', () => {
    const fixture = buildPerfFixture(PROFILE_X100);
    expect(fixture.tasks).toHaveLength(6600);
    expect(fixture.events).toHaveLength(35_000);
    expect(fixture.projects).toHaveLength(40);
    expect(fixture.counts).toEqual({
      startDiffers: 660,
      multiDayTasks: 330,
      series: 50,
      allDayEvents: 7000,
      multiDayEvents: 1050,
    });
    const perOpen = requestsPerYearOpen(6600);
    expect(perOpen).toBe(69);
    const opens = baselineOpens(6600);
    expect(opens).toBe(8);
    expect(perOpen * (opens + 1)).toBeLessThanOrEqual(PRODUCTION_RATE_LIMIT);
    expect(Math.floor(PRODUCTION_RATE_LIMIT / perOpen)).toBeGreaterThanOrEqual(14);
  });

  it('keeps the sentinel alone on its day and inside the Madrid year window', () => {
    const fixture = buildPerfFixture(PROFILE_X100);
    const window = yearWindow();
    const sentinel = fixture.tasks.filter((task) => civilDay(task.due) === SENTINEL_DAY);
    expect(sentinel.map((task) => task.title)).toEqual([SENTINEL_TITLE]);
    for (const task of fixture.tasks) {
      expect(task.due.toISOString() > window.dueAfter).toBe(true);
      expect(task.due.toISOString() < window.dueBefore).toBe(true);
      if (task.start !== null) {
        expect(civilDay(task.start)).not.toBe(SENTINEL_DAY);
        expect(task.title === SENTINEL_TITLE).toBe(false);
      }
    }
    expect(fixture.events.some((event) => eventCoversDay(event, SENTINEL_DAY))).toBe(false);
    const ordered = [...fixture.tasks].sort(
      (left, right) => left.due.getTime() - right.due.getTime(),
    );
    const rank = ordered.findIndex((task) => task.title === SENTINEL_TITLE);
    expect(rank).toBeGreaterThanOrEqual(0);
    expect(rank).toBeLessThan(100);
  });

  it('places the spring and autumn clock changes on their Madrid civil days', () => {
    const fixture = buildPerfFixture(PROFILE_S);
    const spring = fixture.events.find((event) => event.title === 'Perf DST spring');
    const autumn = fixture.events.find((event) => event.title === 'Perf DST autumn');
    expect(spring).toBeDefined();
    expect(autumn).toBeDefined();
    expect(civilDay(spring?.startsAt ?? new Date(0))).toBe('2026-03-29');
    expect(civilDay(spring?.endsAt ?? new Date(0))).toBe('2026-03-29');
    expect(civilDay(autumn?.startsAt ?? new Date(0))).toBe('2026-10-25');
    expect((autumn?.endsAt.getTime() ?? 0) > (autumn?.startsAt.getTime() ?? 0)).toBe(true);
    expect(fixture.tasks).toHaveLength(70);
    expect(fixture.events).toHaveLength(100);
    expect(fixture.counts.series).toBe(1);
    expect(fixture.counts.startDiffers).toBe(7);
    expect(fixture.counts.allDayEvents).toBe(20);
    expect(fixture.counts.multiDayEvents).toBe(3);
  });

  it('refuses a non-local or non-perf database', () => {
    expect(() => {
      assertEphemeralDatabase(
        'postgresql://reflexionia:dev@127.0.0.1:5432/reflexionia',
        'ephemeral',
      );
    }).toThrow(/reflexionia_perf/);
    expect(() => {
      assertEphemeralDatabase(
        'postgresql://reflexionia:secret@todo.reflexionia.com:5432/reflexionia_perf',
        'ephemeral',
      );
    }).toThrow(/refuses/);
    expect(() => {
      assertEphemeralDatabase(
        'postgresql://reflexionia:perf@127.0.0.1:54329/reflexionia_perf',
        'no',
      );
    }).toThrow(/PERF_SEED/);
    expect(() => {
      assertEphemeralDatabase(
        'postgresql://reflexionia:perf@127.0.0.1:54329/reflexionia_perf',
        'ephemeral',
      );
    }).not.toThrow();
    expect(() => {
      assertEphemeralDatabase(
        'postgresql://reflexionia:perf@perf-pg:5432/reflexionia_perf',
        'ephemeral',
      );
    }).not.toThrow();
    expect(() => {
      assertEphemeralDatabase(
        'postgresql://reflexionia:dev@postgres:5432/reflexionia_perf',
        'ephemeral',
      );
    }).toThrow(/refuses/);
  });
});
