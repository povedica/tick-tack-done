import { parseQuickAdd, type QuickAddParse } from '@reflexionia/domain';
import type { CreateTaskBody } from '@reflexionia/sdk';

export type ViewDay = 'today' | 'tomorrow';

export interface QuickAddInput {
  readonly text: string;
  readonly language: 'es' | 'en';
  readonly now: string;
  readonly timeZone: string;
  /** When the view implies a day and the text has no date, that day is the due date. */
  readonly viewDay: ViewDay | null;
  /** Used only when the text does not name a list. Omitted so the server keeps Inbox. */
  readonly defaultProjectId?: string | undefined;
}

export interface QuickAddRequest {
  readonly body: CreateTaskBody;
  /** Local due instant when the view supplies the day. Null when the text already has one. */
  readonly dueDate: string | null;
  readonly parsed: QuickAddParse;
}

/** RF-102. Explicit due date and list win over the view defaults; the server parses raw_text. */
export function quickAddRequest(input: QuickAddInput): QuickAddRequest {
  const parsed = parseQuickAdd(input.text, input.language, {
    now: input.now,
    timeZone: input.timeZone,
  });
  const dueDate =
    input.viewDay !== null && parsed.due === null && parsed.start === null && !parsed.someday
      ? dueForView(input.viewDay, input.now, input.timeZone)
      : undefined;
  const projectId =
    parsed.listName === null &&
    input.defaultProjectId !== undefined &&
    input.defaultProjectId.length > 0
      ? input.defaultProjectId
      : undefined;
  // OpenAPI types nullable strings as `{}`. The wire value is an ISO instant.
  const body = {
    raw_text: input.text,
    ...(dueDate === undefined
      ? {}
      : { due_date: dueDate, is_all_day: true, time_zone: input.timeZone }),
    ...(projectId === undefined ? {} : { project_id: projectId }),
  } as unknown as CreateTaskBody;
  return { parsed, dueDate: dueDate ?? null, body };
}

function dueForView(day: ViewDay, now: string, timeZone: string): string | undefined {
  const probe = day === 'today' ? 'hoy' : 'mañana';
  return parseQuickAdd(probe, 'es', { now, timeZone }).due?.date;
}
