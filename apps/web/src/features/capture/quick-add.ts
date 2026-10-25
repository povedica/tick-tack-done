import {
  parseQuickAdd,
  parseCapture,
  captureSettings,
  type CaptureSettings,
  type QuickAddParse,
} from '@reflexionia/domain';
import type { CreateTaskBody } from '@reflexionia/sdk';
import { slotToTaskBody, type ViewSlot } from './calendar-slot';

export type ViewDay = 'today' | 'tomorrow';

export interface QuickAddInput {
  readonly settings?: CaptureSettings;
  readonly text: string;
  readonly language: 'es' | 'en';
  readonly now: string;
  readonly timeZone: string;
  /** When the view implies a day and the text has no date, that day is the due date. */
  readonly viewDay: ViewDay | null;
  readonly viewSlot?: ViewSlot | undefined;
  /** View context when the text does not name a list; otherwise the server applies account defaults. */
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
  const settings = input.settings ?? captureSettings(null);
  const parsed = parseCapture(
    input.text,
    input.language,
    { now: input.now, timeZone: input.timeZone },
    {
      ...settings,
      default_date:
        input.viewDay !== null || input.viewSlot !== undefined ? 'none' : settings.default_date,
    },
  );
  const slot =
    parsed.due === null && parsed.start === null && !parsed.someday ? input.viewSlot : undefined;
  const dueDate =
    slot === undefined &&
    input.viewDay !== null &&
    parsed.due === null &&
    parsed.start === null &&
    !parsed.someday
      ? dueForView(input.viewDay, input.now, input.timeZone, settings)
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
    ...(slot === undefined ? {} : slotToTaskBody(slot, input.timeZone)),
    ...(dueDate === undefined
      ? {}
      : {
          due_date: dueDate,
          is_all_day: settings.default_date_mode === 'date',
          time_zone: input.timeZone,
        }),
    ...(projectId === undefined ? {} : { project_id: projectId }),
  } as unknown as CreateTaskBody;
  return { parsed, dueDate: slot?.start ?? dueDate ?? null, body };
}

function dueForView(
  day: ViewDay,
  now: string,
  timeZone: string,
  settings: CaptureSettings,
): string | undefined {
  const probe = day === 'today' ? 'hoy' : 'mañana';
  return parseQuickAdd(
    `${probe}${settings.default_date_mode === 'date_time' ? ` ${settings.default_time}` : ''}`,
    'es',
    { now, timeZone },
  ).due?.date;
}
