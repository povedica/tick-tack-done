import type { Prisma } from '@prisma/client';

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
