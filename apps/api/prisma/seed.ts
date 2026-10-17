import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { PrismaClient, type SmartListKey } from '@prisma/client';
import argon2 from 'argon2';

const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
const INBOX_ID = '00000000-0000-4000-8000-000000000010';
const PERSONAL_LIST_ID = '00000000-0000-4000-8000-000000000011';
const FOLDER_ID = '00000000-0000-4000-8000-000000000020';
const TAG_HOME_ID = '00000000-0000-4000-8000-000000000030';
const TAG_WORK_ID = '00000000-0000-4000-8000-000000000031';
const HABIT_ID = '00000000-0000-4000-8000-000000000040';
const TASK_ID = '00000000-0000-4000-8000-000000000050';
const CHECKLIST_ID = '00000000-0000-4000-8000-000000000051';
const FOCUS_SETTINGS_ID = '00000000-0000-4000-8000-000000000060';

const SMART_LISTS: readonly { id: string; key: SmartListKey; sortOrder: bigint }[] = [
  { id: '00000000-0000-4000-8000-000000000101', key: 'today', sortOrder: 65536n },
  { id: '00000000-0000-4000-8000-000000000102', key: 'tomorrow', sortOrder: 131072n },
  { id: '00000000-0000-4000-8000-000000000103', key: 'next_7_days', sortOrder: 196608n },
  { id: '00000000-0000-4000-8000-000000000104', key: 'all', sortOrder: 262144n },
  { id: '00000000-0000-4000-8000-000000000105', key: 'inbox', sortOrder: 327680n },
  { id: '00000000-0000-4000-8000-000000000106', key: 'assigned_to_me', sortOrder: 393216n },
  { id: '00000000-0000-4000-8000-000000000107', key: 'completed', sortOrder: 458752n },
  { id: '00000000-0000-4000-8000-000000000108', key: 'trash', sortOrder: 524288n },
  { id: '00000000-0000-4000-8000-000000000109', key: 'no_date', sortOrder: 589824n },
  { id: '00000000-0000-4000-8000-000000000110', key: 'recently_added', sortOrder: 655360n },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}. Copy .env.example to .env before seeding.`);
  }
  return value;
}

function loadRootEnv(): void {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  const email = requireEnv('SEED_USER_EMAIL');
  const password = requireEnv('SEED_USER_PASSWORD');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const prisma = new PrismaClient();

  try {
    await prisma.user.upsert({
      where: { id: DEMO_USER_ID },
      update: { email, passwordHash, displayName: 'Demo' },
      create: {
        id: DEMO_USER_ID,
        email,
        passwordHash,
        displayName: 'Demo',
        timeZone: 'Europe/Madrid',
      },
    });

    await prisma.focusSettings.upsert({
      where: { userId: DEMO_USER_ID },
      update: {},
      create: { id: FOCUS_SETTINGS_ID, userId: DEMO_USER_ID },
    });

    await prisma.folder.upsert({
      where: { id: FOLDER_ID },
      update: { name: 'Vida' },
      create: { id: FOLDER_ID, ownerId: DEMO_USER_ID, name: 'Vida', sortOrder: 65536n },
    });

    await prisma.project.upsert({
      where: { id: INBOX_ID },
      update: { name: 'Bandeja de entrada', isInbox: true },
      create: {
        id: INBOX_ID,
        ownerId: DEMO_USER_ID,
        name: 'Bandeja de entrada',
        isInbox: true,
        sortOrder: 65536n,
      },
    });

    await prisma.project.upsert({
      where: { id: PERSONAL_LIST_ID },
      update: { name: 'Personal', folderId: FOLDER_ID },
      create: {
        id: PERSONAL_LIST_ID,
        ownerId: DEMO_USER_ID,
        name: 'Personal',
        folderId: FOLDER_ID,
        color: '#4f46e5',
        sortOrder: 131072n,
      },
    });

    await prisma.tag.upsert({
      where: { id: TAG_HOME_ID },
      update: { name: 'casa' },
      create: {
        id: TAG_HOME_ID,
        ownerId: DEMO_USER_ID,
        name: 'casa',
        color: '#F18181',
        sortOrder: 65536n,
      },
    });

    await prisma.tag.upsert({
      where: { id: TAG_WORK_ID },
      update: { name: 'trabajo' },
      create: {
        id: TAG_WORK_ID,
        ownerId: DEMO_USER_ID,
        name: 'trabajo',
        color: '#4f46e5',
        sortOrder: 131072n,
      },
    });

    await prisma.task.upsert({
      where: { id: TASK_ID },
      update: { title: 'Revisar la bandeja' },
      create: {
        id: TASK_ID,
        ownerId: DEMO_USER_ID,
        projectId: INBOX_ID,
        createdById: DEMO_USER_ID,
        title: 'Revisar la bandeja',
        content: 'Tarea de ejemplo del seed de desarrollo.',
        priority: 'medium',
        sortOrder: 65536n,
      },
    });

    await prisma.taskTag.upsert({
      where: { taskId_tagId: { taskId: TASK_ID, tagId: TAG_HOME_ID } },
      update: {},
      create: { taskId: TASK_ID, tagId: TAG_HOME_ID },
    });

    await prisma.checklistItem.upsert({
      where: { id: CHECKLIST_ID },
      update: { title: 'Abrir la bandeja' },
      create: {
        id: CHECKLIST_ID,
        ownerId: DEMO_USER_ID,
        taskId: TASK_ID,
        title: 'Abrir la bandeja',
        sortOrder: 65536n,
      },
    });

    await prisma.habit.upsert({
      where: { id: HABIT_ID },
      update: { name: 'Beber agua' },
      create: {
        id: HABIT_ID,
        ownerId: DEMO_USER_ID,
        name: 'Beber agua',
        icon: 'droplet',
        color: '#38bdf8',
        goal: { times_per_period: 8, period: 'day', target_count: 8 },
        frequency: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        reminderTime: '09:00',
        sortOrder: 65536n,
      },
    });

    for (const smartList of SMART_LISTS) {
      await prisma.smartList.upsert({
        where: { ownerId_key: { ownerId: DEMO_USER_ID, key: smartList.key } },
        update: { enabled: true, sortOrder: smartList.sortOrder },
        create: {
          id: smartList.id,
          ownerId: DEMO_USER_ID,
          key: smartList.key,
          enabled: true,
          sortOrder: smartList.sortOrder,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
