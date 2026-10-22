import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SettingsDto } from './focus.controller.js';
import { expect, it } from 'vitest';
import { FocusController } from './focus.controller.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { EventRecorder } from '../../events/event-recorder.js';
it.each([true, false])(
  'TTD-AUD-84: elapsed freezes after completed=%s, including an hour later',
  (completed) => {
    const controller = new FocusController({} as PrismaService, new EventRecorder());
    const row = {
      id: 'session',
      type: 'focus' as const,
      plannedMinutes: 25,
      actualSeconds: 28,
      startedAt: new Date('2026-10-22T10:00:00Z'),
      endedAt: new Date('2026-10-22T10:00:28Z'),
      completed,
      taskId: null,
      pausedAt: null,
      pausedSeconds: 0,
    };
    // eslint-disable-next-line @typescript-eslint/dot-notation -- Exercise the serialization boundary without exposing it publicly.
    const result = controller['json'](row, new Date('2026-10-22T11:00:28Z'));
    expect(result.elapsed_seconds).toBe(28);
  },
);

it('TTD-AUD-101: settings validate supported ranges and five-minute pomo steps', async () => {
  expect(
    await validate(
      plainToInstance(SettingsDto, {
        pomodoro_minutes: 45,
        long_break_minutes: 90,
        auto_start_breaks: true,
        alarm_sound: 'bell',
        volume: 70,
        daily_goal: 8,
      }),
    ),
  ).toHaveLength(0);
  for (const dto of [
    { pomodoro_minutes: 200 },
    { pomodoro_minutes: 26 },
    { pomodoro_minutes: 1 },
    { short_break_minutes: 61 },
    { long_break_minutes: 4 },
    { volume: 101 },
    { daily_goal: 21 },
    { alarm_sound: 'external-url' },
  ]) {
    expect((await validate(plainToInstance(SettingsDto, dto))).length).toBeGreaterThan(0);
  }
});
