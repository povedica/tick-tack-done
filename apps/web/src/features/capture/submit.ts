import { parseQuickAdd, startOfZonedDay } from '@reflexionia/domain';
import type { CreateTaskBody } from '@reflexionia/sdk';

export function todayCaptureBody(
  text: string,
  now: Date,
  timeZone: string,
  language: 'es' | 'en',
): CreateTaskBody {
  const parsed = parseQuickAdd(text, language, { now: now.toISOString(), timeZone });
  if (parsed.due !== null) {
    return { raw_text: text };
  }
  const due = startOfZonedDay(now.toISOString(), timeZone);
  if (due === null) {
    return { raw_text: text };
  }
  return {
    raw_text: text,
    // The generated client types a nullable string as an empty object.
    due_date: due as unknown as Record<string, never>,
    is_all_day: true,
    time_zone: timeZone,
  };
}

export function listCaptureBody(text: string, projectId: string): CreateTaskBody {
  return { raw_text: text, project_id: projectId };
}
