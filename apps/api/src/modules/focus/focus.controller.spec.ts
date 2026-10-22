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
