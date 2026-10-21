import {
  isReportTone,
  dayKey,
  parseDayBounds,
  addCalendarDays,
  bucketWeek,
  focusMinutesTotal,
  type ReportTone,
} from '@reflexionia/domain';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MetricsService } from '../modules/metrics/metrics.service.js';
import { loadDashboardSnapshot } from './snapshot.js';

/** Shared read model: automation and manual API generation use one local Monday cutoff and payload. */
export async function readWeeklyReport(
  prisma: PrismaService,
  metrics: Pick<MetricsService, 'focusRows' | 'activeHabitsExpectedDays'>,
  user: { readonly id: string; readonly timeZone: string },
  now: Date,
) {
  const settings = normalizeReportSettings(
    (
      await prisma.user.findFirst({
        where: { id: user.id },
        select: { weeklyReportSettings: true },
      })
    )?.weeklyReportSettings,
  );
  const local = dayKey(now.toISOString(), user.timeZone) ?? now.toISOString().slice(0, 10);
  const weekday = new Date(`${local}T12:00:00Z`).getUTCDay();
  const monday = addCalendarDays(local, -(weekday === 0 ? 6 : weekday - 1)) ?? local;
  const range = parseDayBounds(monday, addCalendarDays(monday, 6) ?? monday, user.timeZone);
  const week = new Date(`${monday}T00:00:00Z`);
  const periodStart = new Date(range?.startIso ?? week.toISOString());
  const snapshot = await loadDashboardSnapshot(prisma, user.id, now, user.timeZone);
  const focusRows = await metrics.focusRows(user.id, periodStart, now);
  const focusMinutes = focusMinutesTotal(focusRows);
  const habits = await metrics.activeHabitsExpectedDays(user.id, periodStart, now, user.timeZone);
  const countdowns = await prisma.countdown.findMany({
    where: { ownerId: user.id, deletedAt: null, archivedAt: null },
    select: { id: true, title: true, emoji: true, targetDate: true },
  });
  const upcomingCountdowns = countdowns.filter(
    (countdown) =>
      countdown.targetDate >= now &&
      countdown.targetDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  );
  const reachedCountdowns = countdowns.filter(
    (countdown) =>
      countdown.targetDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) &&
      countdown.targetDate < now,
  );
  const closingLine = await readClosingLine(prisma, user.id, periodStart, now);
  const touched = await prisma.task.findMany({
    where: {
      ownerId: user.id,
      deletedAt: null,
      OR: [
        { createdAt: { gte: periodStart, lt: now } },
        { completedAt: { gte: periodStart, lt: now } },
      ],
    },
    select: { createdAt: true, completedAt: true },
  });
  const days = bucketWeek(
    week.toISOString(),
    touched.map((task) => ({
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
    })),
    user.timeZone,
    now.toISOString(),
  );
  const completed = days.reduce((sum, day) => sum + day.completed, 0);
  const created = days.reduce((sum, day) => sum + day.created, 0);
  const payload = {
    calculated_at: now.toISOString(),
    time_zone: user.timeZone,
    metrics_version: 2,
    summary: `${String(completed)} tareas completadas y ${String(created)} creadas. ${closingLine}`,
    observations: [],
    snapshot: { ...snapshot, completed, created, trend: null },
    completed,
    created,
    overdue: snapshot.overdue,
    focus_minutes: focusRows.some((session) => session.type === 'focus') ? focusMinutes : null,
    habits_done: habits.done,
    habits_expected: habits.expected,
    trend: null,
    trend_label: null,
    days,
    countdowns: {
      upcoming: upcomingCountdowns.map((countdown) => ({
        id: countdown.id,
        title: countdown.title,
        emoji: countdown.emoji,
      })),
      reached: reachedCountdowns.map((countdown) => ({
        id: countdown.id,
        title: countdown.title,
        emoji: countdown.emoji,
      })),
    },
  };
  return { week, settings, payload };
}

async function readClosingLine(
  prisma: PrismaService,
  ownerId: string,
  from: Date,
  to: Date,
): Promise<string> {
  const sessions = await prisma.planSession.findMany({
    where: {
      ownerId,
      kind: 'shutdown',
      state: 'applied',
      updatedAt: { gte: from, lt: to },
    },
    select: { decisions: { select: { decision: true } } },
  });
  const moved = sessions.reduce(
    (sum, session) =>
      sum +
      session.decisions.filter(
        (decision) =>
          decision.decision === 'plan_day' ||
          decision.decision === 'later' ||
          decision.decision === 'someday',
      ).length,
    0,
  );
  return `Cerraste el día ${String(sessions.length)} de 7 días; moviste ${String(moved)} tareas en los cierres.`;
}

export interface ReportSettings {
  day: string;
  time: string;
  tone: ReportTone;
  channels: string[];
}

export function normalizeReportSettings(value: unknown): ReportSettings {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const tone =
    typeof record.tone === 'string' && isReportTone(record.tone) ? record.tone : 'honesto';
  return {
    day: typeof record.day === 'string' ? record.day : 'sunday',
    time: typeof record.time === 'string' ? record.time : '20:00',
    tone,
    channels: Array.isArray(record.channels)
      ? record.channels.filter((item): item is string => typeof item === 'string')
      : ['email'],
  };
}
