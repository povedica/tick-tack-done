import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { eventLocalDayColumns, taskLocalDayColumns } from '../prisma/local-day-columns.js';
import argon2 from 'argon2';
import { API_SCOPES } from '../auth/scopes.js';
import { newSessionSecret } from '../auth/session-cookie.js';
import { newPersonalAccessToken } from '../auth/token-secret.js';
import {
  assertEphemeralDatabase,
  buildPerfFixture,
  PERF_ZONE,
  profileByName,
  type EventFixture,
  type PerfFixture,
  type TaskFixture,
} from './fixture.js';

const BATCH = 500;

export async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  assertEphemeralDatabase(databaseUrl, process.env.PERF_SEED);
  const password = process.env.PERF_SEED_PASSWORD ?? '';
  if (password.length < 12) {
    throw new Error('seed-perf: PERF_SEED_PASSWORD must be at least 12 characters');
  }
  const manifestPath = requiredPath('PERF_MANIFEST');
  const tokenPath = requiredPath('PERF_TOKEN_FILE');
  const sessionPath = requiredPath('PERF_SESSION_FILE');
  const profile = profileByName(process.env.PERF_PROFILE ?? 'x100');
  const fixture = buildPerfFixture(profile);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
    const userId = await insertOwner(prisma, password);
    await insertProjects(prisma, userId, fixture);
    const subscriptionId = await insertSubscription(prisma, userId);
    await insertTasks(prisma, userId, fixture);
    await insertEvents(prisma, userId, subscriptionId, fixture.events);
    const token = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId: userId,
        name: 'perf',
        tokenHash: token.hash,
        tokenPrefix: token.prefix,
        scopes: [...API_SCOPES],
      },
    });
    const session = newSessionSecret();
    await prisma.session.create({
      data: {
        userId,
        tokenHash: session.hash,
        csrfToken: session.csrf,
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });
    writeSecret(tokenPath, token.token);
    writeSecret(sessionPath, JSON.stringify({ token: session.token, csrf: session.csrf }));
    writeJson(manifestPath, manifestOf(fixture));
    await prisma.$executeRawUnsafe('ANALYZE tasks');
    await prisma.$executeRawUnsafe('ANALYZE external_events');
    await prisma.$executeRawUnsafe('ANALYZE projects');
    await prisma.$executeRawUnsafe('ANALYZE calendar_subscriptions');
    console.info(
      `seed-perf profile=${profile.name} tasks=${String(fixture.tasks.length)} events=${String(fixture.events.length)} projects=${String(fixture.projects.length)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function manifestOf(fixture: PerfFixture): unknown {
  return {
    profile: fixture.profile.name,
    year: 2026,
    zone: PERF_ZONE,
    sentinel: { title: 'PERF-SENTINEL', day: '2026-01-05' },
    counts: {
      tasks: fixture.tasks.length,
      events: fixture.events.length,
      projects: fixture.projects.length,
      ...fixture.counts,
    },
    yearWindow: fixture.yearWindow,
    requestsPerOpen: Math.ceil(fixture.tasks.length / 100) + 3,
  };
}

async function insertOwner(prisma: PrismaClient, password: string): Promise<string> {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email: 'perf-seed@example.test',
      passwordHash,
      displayName: 'Perf',
      timeZone: PERF_ZONE,
      locale: 'es',
    },
  });
  return user.id;
}

async function insertProjects(
  prisma: PrismaClient,
  ownerId: string,
  fixture: PerfFixture,
): Promise<void> {
  await prisma.project.createMany({
    data: fixture.projects.map((project) => ({
      id: project.id,
      ownerId,
      name: project.name,
      color: project.color,
      isInbox: project.isInbox,
      sortOrder: project.sortOrder,
    })),
  });
}

async function insertSubscription(prisma: PrismaClient, ownerId: string): Promise<string> {
  const row = await prisma.calendarSubscription.create({
    data: {
      ownerId,
      provider: 'perf',
      summary: 'Perf',
      visible: true,
      color: '#4f46e5',
    },
  });
  return row.id;
}

async function insertTasks(
  prisma: PrismaClient,
  ownerId: string,
  fixture: PerfFixture,
): Promise<void> {
  for (const batch of chunks(fixture.tasks, BATCH)) {
    await prisma.task.createMany({
      data: batch.map((task) => taskRow(ownerId, fixture, task)),
    });
  }
}

function taskRow(ownerId: string, fixture: PerfFixture, task: TaskFixture) {
  const project = fixture.projects[task.projectIndex];
  if (project === undefined) {
    throw new Error('perf fixture project index is out of range');
  }
  return {
    id: task.id,
    ownerId,
    projectId: project.id,
    createdById: ownerId,
    title: task.title,
    dueDate: task.due,
    startDate: task.start,
    timeZone: PERF_ZONE,
    ...taskLocalDayColumns({ start: task.start, due: task.due, timeZone: PERF_ZONE }),
    seriesId: task.seriesId,
    repeatRule: task.repeatRule,
    sortOrder: task.sortOrder,
  };
}

async function insertEvents(
  prisma: PrismaClient,
  ownerId: string,
  subscriptionId: string,
  events: readonly EventFixture[],
): Promise<void> {
  for (const batch of chunks(events, BATCH)) {
    await prisma.externalEvent.createMany({
      data: batch.map((event) => ({
        id: event.id,
        ownerId,
        subscriptionId,
        externalUid: event.uid,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isAllDay: event.allDay,
        timeZone: PERF_ZONE,
        ...eventLocalDayColumns({
          start: event.startsAt,
          end: event.endsAt,
          timeZone: PERF_ZONE,
          allDay: event.allDay,
          profileTimeZone: PERF_ZONE,
        }),
      })),
    });
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function requiredPath(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`seed-perf: ${name} is required`);
  }
  return value;
}

function writeSecret(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, { encoding: 'utf8', mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
}
