import {
  addCalendarDays,
  daysInMonth,
  instantFromWall,
  wallClock,
  type WallClock,
} from '../dates/zoned';
import { isPriority } from '../priority/priority';
import { buildRepeatRule, parseRepeatRule, type Weekday } from '../recurrence/rule';
import { parseTrigger } from '../reminders/trigger';
import { normalizeTagName, tagNameKey } from '../tags/tags';
import { isIanaTimeZone } from '../tasks/time-zone';
import type {
  Priority,
  QuickAddContext,
  QuickAddDue,
  QuickAddParse,
  QuickAddPattern,
  QuickAddSpan,
  QuickAddSpanKind,
} from '../types';

export type QuickAddLanguage = 'es' | 'en';

/**
 * TickTick quick-add: !1 and p1 are high, !2 and p2 medium, !3 and p3 low. */
const BANG_LEVEL: Readonly<Record<string, Priority>> = {
  '1': 'high',
  '2': 'medium',
  '3': 'low',
};

const PRIORITY_WORD: Readonly<Record<string, Priority>> = {
  baja: 'low',
  low: 'low',
  p3: 'low',
  media: 'medium',
  medium: 'medium',
  p2: 'medium',
  alta: 'high',
  high: 'high',
  p1: 'high',
};

const WEEKDAY: Readonly<Record<string, Weekday>> = {
  lunes: 'MO',
  monday: 'MO',
  martes: 'TU',
  tuesday: 'TU',
  miércoles: 'WE',
  miercoles: 'WE',
  wednesday: 'WE',
  jueves: 'TH',
  thursday: 'TH',
  viernes: 'FR',
  friday: 'FR',
  sábado: 'SA',
  sabado: 'SA',
  saturday: 'SA',
  domingo: 'SU',
  sunday: 'SU',
};

const MONTH_NAME: Readonly<Record<string, number>> = {
  enero: 1,
  january: 1,
  jan: 1,
  febrero: 2,
  february: 2,
  feb: 2,
  marzo: 3,
  march: 3,
  mar: 3,
  abril: 4,
  april: 4,
  apr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  june: 6,
  jun: 6,
  julio: 7,
  july: 7,
  jul: 7,
  agosto: 8,
  august: 8,
  aug: 8,
  septiembre: 9,
  setiembre: 9,
  september: 9,
  sep: 9,
  sept: 9,
  octubre: 10,
  october: 10,
  oct: 10,
  noviembre: 11,
  november: 11,
  nov: 11,
  diciembre: 12,
  december: 12,
  dec: 12,
};

const RELATIVE =
  /(?<![\p{L}\p{N}])(pasado\s+mañana|day\s+after\s+tomorrow|mañana|tomorrow|hoy|today)(?![\p{L}\p{N}])/giu;

/** REC-4: "cada día 19 de mes" must be MONTHLY, not DAILY. */
const MONTH_DAY_EVERY =
  /(?<![\p{L}\p{N}])(?:cada|el)\s+(?:d[ií]a\s+)?(\d{1,2})\s+de\s+(?:cada\s+)?mes(?![\p{L}\p{N}])/giu;

const EVERY =
  /(?<![\p{L}\p{N}])(?:cada|todos\s+los|every)\s+(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|d[ií]a|semana|mes|a[nñ]o|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekdays|day|week|month|year)(?![\p{L}\p{N}])/giu;

const NUMERIC_DATE =
  /(?<![\p{L}\p{N}])(?:(el|on)\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?(?![\p{L}\p{N}])/giu;

const MONTH_WORD =
  /(?<![\p{L}\p{N}])(?:(?:el|on)\s+)?(?:(\d{1,2})(?:st|nd|rd|th)?\s+de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?(?![\p{L}\p{N}])/giu;

const REMINDER =
  /(?<![\p{L}\p{N}])(?:av[ií]same|remind\s+me)\s+(\d+)\s*(min(?:uto)?s?|h(?:our|ora)?s?|d(?:[ií]as?|ays?))\s+(?:antes|before)(?![\p{L}\p{N}])/giu;

const PRIORITY_TOKEN =
  /(?<![\p{L}\p{N}])(?:!(alta|media|baja|high|medium|low|[123])|p([123]))(?![\p{L}\p{N}])/giu;

const TAG = /(?<![\p{L}\p{N}])#([\p{L}\p{N}_][\p{L}\p{N}_-]{0,98})(?![\p{L}\p{N}])/giu;

const LIST = /(?<![\p{L}\p{N}])[~^@]([\p{L}\p{N}_][\p{L}\p{N}_-]{0,98})(?![\p{L}\p{N}])/giu;

interface Clock {
  readonly hour: number;
  readonly minute: number;
}

interface Found {
  readonly start: number;
  readonly end: number;
  readonly kind: QuickAddSpanKind;
  readonly apply: (draft: Draft) => void;
}

interface Draft {
  priority: Priority | null;
  tagNames: string[];
  listName: string | null;
  due: QuickAddDue | null;
  start: QuickAddDue | null;
  durationMinutes: number | null;
  someday: boolean;
  eveningOnly: boolean;
  repeatRule: string | null;
  reminderTrigger: string | null;
  spans: QuickAddSpan[];
  dates: DateAnchor[];
  clocks: ClockAnchor[];
}

interface DateAnchor {
  readonly start: number;
  readonly end: number;
  readonly day: WallClock;
  readonly clock: Clock | null;
  readonly repeatRule: string | null;
  readonly weekday: Weekday | null;
  readonly resolved: QuickAddDue | null;
  readonly slot: 'due' | 'when';
}

interface ClockAnchor {
  readonly start: number;
  readonly end: number;
  readonly clock: Clock;
}

interface ClockContext {
  readonly now: WallClock;
  readonly nowIso: string;
  readonly timeZone: string;
}

type Matcher = (
  text: string,
  from: number,
  language: QuickAddLanguage,
  clock: ClockContext | null,
) => Found | null;

/** RF-102, RF-103. Rule parser. Spans keep offsets into the original text. */
export function parseQuickAdd(
  text: string,
  language: QuickAddLanguage,
  context?: QuickAddContext,
): QuickAddParse {
  const clock = readClock(context);
  const matchers = [...extraMatchers(context?.patterns ?? []), ...builtinMatchers];
  const draft: Draft = {
    priority: null,
    tagNames: [],
    listName: null,
    due: null,
    start: null,
    durationMinutes: null,
    someday: false,
    eveningOnly: false,
    repeatRule: null,
    reminderTrigger: null,
    spans: [],
    dates: [],
    clocks: [],
  };
  let cursor = 0;
  while (cursor < text.length) {
    const found = earliest(text, cursor, language, clock, matchers);
    if (found === null) {
      break;
    }
    if (found.end <= found.start) {
      cursor += 1;
      continue;
    }
    found.apply(draft);
    draft.spans.push({ start: found.start, end: found.end, kind: found.kind });
    cursor = found.end;
  }
  const dropped = settleSchedule(draft, clock);
  const spans = [...draft.spans]
    .filter((span) => !dropped.some((item) => item.start === span.start && item.end === span.end))
    .sort((left, right) => left.start - right.start);
  return {
    title: titleWithout(text, spans),
    spans,
    priority: draft.priority,
    tagNames: draft.tagNames,
    listName: draft.listName,
    due: draft.due,
    start: draft.start,
    durationMinutes: draft.durationMinutes,
    someday: draft.someday,
    eveningOnly: draft.eveningOnly,
    repeatRule: draft.repeatRule,
    reminderTrigger: draft.reminderTrigger,
  };
}

const builtinMatchers: readonly Matcher[] = [
  matchDeadline,
  matchDuration,
  matchSomeday,
  matchEvening,
  matchRelative,
  matchMonthDayEvery,
  matchEvery,
  matchNumericDate,
  matchMonthWord,
  matchWeekday,
  matchOffset,
  matchDayPart,
  matchMeridiem,
  matchAmPm,
  matchHourMark,
  matchBareTime,
  matchLooseHour,
  matchReminder,
  matchPriority,
  matchTag,
  matchList,
];

function readClock(context: QuickAddContext | undefined): ClockContext | null {
  if (context === undefined || !isIanaTimeZone(context.timeZone)) {
    return null;
  }
  const now = wallClock(context.now, context.timeZone);
  if (now === null) {
    return null;
  }
  return { now, nowIso: context.now, timeZone: context.timeZone };
}

function earliest(
  text: string,
  from: number,
  language: QuickAddLanguage,
  clock: ClockContext | null,
  matchers: readonly Matcher[],
): Found | null {
  let best: Found | null = null;
  for (const matcher of matchers) {
    const found = matcher(text, from, language, clock);
    if (found === null || found.end <= found.start) {
      continue;
    }
    if (
      best === null ||
      found.start < best.start ||
      (found.start === best.start && found.end > best.end)
    ) {
      best = found;
    }
  }
  return best;
}

function matchRelative(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  const match = firstMatch(text, from, RELATIVE);
  if (match?.[1] === undefined) {
    return null;
  }
  const days = relativeDays(match[1]);
  if (days === null) {
    return null;
  }
  const timed = extendWithTime(text, match.index + match[0].length);
  const day = addCalendarDays(clock.now, days);
  return dateFound(match.index, timed, day, null, clock.timeZone);
}

const BARE_TIME = /(?:(?:a\s+las|at)\s+)?(\d{1,2}):(\d{2})(?!\d)/giu;
const LOOSE_HOUR = /(?:a\s+las|at)\s+(\d{1,2})(?![:\d])/giu;
const HOUR_MARK = /(?<![\p{L}\p{N}])(\d{1,2})(?::(\d{2}))?h(?![\p{L}\p{N}])/giu;
const DAY_PART =
  /(?:a\s+las|at)\s+(\d{1,2})(?::(\d{2}))?\s+de\s+la\s+(mañana|tarde|noche)(?![\p{L}\p{N}])/giu;
const MERIDIEM = /(?<![\p{L}\p{N}])(?:a\s+las\s+)?(mediod[ií]a|medianoche)(?![\p{L}\p{N}])/giu;
const AM_PM =
  /(?<![\p{L}\p{N}])(?:(?:a\s+las|at)\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?(?![\p{L}\p{N}])/giu;
const WEEKDAY_WORD =
  /(?<![\p{L}\p{N}])(?:(?:el|on)\s+)?(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?![\p{L}\p{N}])/giu;
const OFFSET =
  /(?<![\p{L}\p{N}])(?:en|dentro\s+de)\s+(un|una|\d+)\s+(minutos?|horas?|d[ií]as?|semanas?)(?![\p{L}\p{N}])/giu;

const DEADLINE =
  /(?<![\p{L}\p{N}])(?:para\s+el|a\s+m[aá]s\s+tardar(?:\s+el)?|fecha\s+l[ií]mite:\s*|deadline\s+)\s*(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?![\p{L}\p{N}])/giu;
const DURATION =
  /(?<![\p{L}\p{N}])~(?:(\d+)\s*h(?:\s*(\d+))?|(\d+)\s*m(?:in(?:utos)?)?)(?![\p{L}\p{N}])/giu;
const SOMEDAY = /(?<![\p{L}\p{N}])(?:alg[uú]n\s+d[ií]a|someday)(?![\p{L}\p{N}])/giu;
const EVENING =
  /(?<![\p{L}\p{N}])(?:esta\s+noche|this\s+evening)(?:\s+(?:a\s+las|at)\s+(\d{1,2})(?::(\d{2}))?)?(?![\p{L}\p{N}])/giu;

function matchDeadline(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, DEADLINE, (match) => {
    const weekday = WEEKDAY[fold(match[1] ?? '')];
    if (weekday === undefined) {
      return null;
    }
    return dateFound(
      match.index,
      { end: match.index + match[0].length, clock: null },
      clock.now,
      null,
      clock.timeZone,
      weekday,
      'due',
    );
  });
}

function matchDuration(text: string, from: number): Found | null {
  return scan(text, from, DURATION, (match) => {
    const hours = match[1] === undefined ? 0 : Number(match[1]);
    const extra = match[2] === undefined ? 0 : Number(match[2]);
    const minutes = match[3] === undefined ? hours * 60 + extra : Number(match[3]);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
      return null;
    }
    return {
      start: match.index,
      end: match.index + match[0].length,
      kind: 'duration',
      apply: (draft) => {
        draft.durationMinutes = minutes;
      },
    };
  });
}

function matchSomeday(text: string, from: number): Found | null {
  return scan(text, from, SOMEDAY, (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    kind: 'date',
    apply: (draft) => {
      draft.someday = true;
    },
  }));
}

function matchEvening(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, EVENING, (match) => {
    const hour = match[1] === undefined ? null : Number(match[1]);
    const minute = match[2] === undefined ? 0 : Number(match[2]);
    const wall =
      hour === null
        ? { ...clock.now, hour: 0, minute: 0, second: 0 }
        : { ...clock.now, hour, minute, second: 0 };
    const date = instantFromWall(wall, clock.timeZone);
    return {
      start: match.index,
      end: match.index + match[0].length,
      kind: 'date' as const,
      apply: (draft: Draft) => {
        draft.eveningOnly = true;
        draft.start = date === null ? null : { date, isAllDay: hour === null };
      },
    };
  });
}

function matchWeekday(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  const match = firstMatch(text, from, WEEKDAY_WORD);
  if (match?.[1] === undefined) {
    return null;
  }
  const weekday = WEEKDAY[fold(match[1])];
  if (weekday === undefined) {
    return null;
  }
  const timed = extendWithTime(text, match.index + match[0].length);
  const slot = /^(?:el|on)\s+/iu.test(match[0]) ? 'when' : 'due';
  return dateFound(match.index, timed, clock.now, null, clock.timeZone, weekday, slot);
}

function matchOffset(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, OFFSET, (match) => {
    if (match[1] === undefined || match[2] === undefined) {
      return null;
    }
    const amount = offsetAmount(match[1]);
    const unit = offsetUnit(match[2]);
    if (amount === null || unit === null || amount < 1 || amount > 999) {
      return null;
    }
    const due = offsetDue(clock, amount, unit);
    if (due === null) {
      return null;
    }
    return {
      start: match.index,
      end: match.index + match[0].length,
      kind: 'date',
      apply: (draft) => {
        draft.dates.push({
          start: match.index,
          end: match.index + match[0].length,
          day: clock.now,
          clock: null,
          repeatRule: null,
          weekday: null,
          resolved: due,
          slot: 'due',
        });
      },
    };
  });
}

function matchDayPart(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, DAY_PART, (match) => {
    const parsed = dayPartClock(
      Number(match[1]),
      match[2] === undefined ? 0 : Number(match[2]),
      match[3],
    );
    if (parsed === null) {
      return null;
    }
    return looseClock(match.index, match.index + match[0].length, parsed);
  });
}

function matchMeridiem(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  const match = firstMatch(text, from, MERIDIEM);
  if (match?.[1] === undefined) {
    return null;
  }
  const hour = fold(match[1]).startsWith('medianoche') ? 0 : 12;
  return looseClock(match.index, match.index + match[0].length, { hour, minute: 0 });
}

function matchAmPm(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, AM_PM, (match) => {
    const parsed = clockFrom(match[1], match[2], match[3]);
    if (parsed === null || dayPartFollows(text, match.index + match[0].length)) {
      return null;
    }
    return looseClock(match.index, match.index + match[0].length, parsed);
  });
}

function matchHourMark(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, HOUR_MARK, (match) => {
    const parsed = clockFrom(match[1], match[2], undefined);
    if (parsed === null) {
      return null;
    }
    return looseClock(match.index, match.index + match[0].length, parsed);
  });
}

function matchBareTime(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, BARE_TIME, (match) => {
    if (!opensAtBoundary(text, match.index)) {
      return null;
    }
    const parsed = clockFrom(match[1], match[2], undefined);
    if (parsed === null) {
      return null;
    }
    const end = match.index + match[0].length;
    const next = text[end];
    if (next !== undefined && /[\p{L}\p{N}]/u.test(next)) {
      return null;
    }
    if (dayPartFollows(text, end)) {
      return null;
    }
    return looseClock(match.index, end, parsed);
  });
}

function matchLooseHour(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, LOOSE_HOUR, (match) => {
    const parsed = clockFrom(match[1], undefined, undefined);
    if (parsed === null || dayPartFollows(text, match.index + match[0].length)) {
      return null;
    }
    const end = match.index + match[0].length;
    const mark = /^\s*h(?![\p{L}\p{N}])/iu.exec(text.slice(end));
    if (mark !== null) {
      return null;
    }
    return looseClock(match.index, end, parsed);
  });
}

function looseClock(start: number, end: number, clock: Clock): Found {
  return {
    start,
    end,
    kind: 'date',
    apply: (draft) => {
      draft.clocks.push({ start, end, clock });
    },
  };
}

function opensAtBoundary(text: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const previous = text[index - 1] ?? '';
  return !/[\p{L}\p{N}]/u.test(previous);
}

function matchMonthDayEvery(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  const match = firstMatch(text, from, MONTH_DAY_EVERY);
  if (match?.[1] === undefined) {
    return null;
  }
  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }
  const timed = extendWithTime(text, match.index + match[0].length);
  const rule = ruleOf({ freq: 'monthly', monthDay: day });
  return rule === null ? null : dateFound(match.index, timed, clock.now, rule, clock.timeZone);
}

function matchEvery(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  const match = firstMatch(text, from, EVERY);
  if (match?.[1] === undefined) {
    return null;
  }
  const word = fold(match[1]);
  const timed = extendWithTime(text, match.index + match[0].length);
  if (word === 'weekday' || word === 'weekdays') {
    const rule = ruleOf({ freq: 'weekly', weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'] });
    const delta = nextWeekdayDelta(clock.now);
    const day = addCalendarDays(clock.now, delta);
    return rule === null ? null : dateFound(match.index, timed, day, rule, clock.timeZone);
  }
  const weekday = WEEKDAY[word];
  if (weekday !== undefined) {
    const delta = (weekdayIndex(weekday) - weekdayIndexOf(clock.now) + 7) % 7;
    const day = addCalendarDays(clock.now, delta);
    const rule = ruleOf({ freq: 'weekly', weekdays: [weekday] });
    return rule === null ? null : dateFound(match.index, timed, day, rule, clock.timeZone);
  }
  const freq = frequencyOf(word);
  if (freq === null) {
    return null;
  }
  const draft = freq === 'monthly' ? { freq, monthDay: clock.now.day } : { freq };
  const rule = ruleOf(draft);
  return rule === null ? null : dateFound(match.index, timed, clock.now, rule, clock.timeZone);
}

function matchNumericDate(
  text: string,
  from: number,
  language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, NUMERIC_DATE, (match) => {
    if (match[2] === undefined || match[3] === undefined) {
      return null;
    }
    const parts = dayAndMonth(
      Number(match[2]),
      Number(match[3]),
      match[1]?.toLocaleLowerCase('es'),
      language,
    );
    if (parts === null) {
      return null;
    }
    const explicitYear = match[4] === undefined ? null : Number(match[4]);
    if (explicitYear !== null && (explicitYear < 1970 || explicitYear > 9999)) {
      return null;
    }
    const year = explicitYear ?? upcomingYear(parts.month, parts.day, clock.now);
    if (!validDay(year, parts.month, parts.day)) {
      return null;
    }
    const timed = extendWithTime(text, match.index + match[0].length);
    return dateFound(
      match.index,
      timed,
      { ...clock.now, year, month: parts.month, day: parts.day },
      null,
      clock.timeZone,
    );
  });
}

function matchMonthWord(
  text: string,
  from: number,
  _language: QuickAddLanguage,
  clock: ClockContext | null,
): Found | null {
  if (clock === null) {
    return null;
  }
  return scan(text, from, MONTH_WORD, (match) => {
    if (match[2] === undefined) {
      return null;
    }
    const month = MONTH_NAME[fold(match[2])];
    const dayText = match[1] ?? match[3];
    if (month === undefined || dayText === undefined) {
      return null;
    }
    const day = Number(dayText);
    const explicitYear = match[4] === undefined ? null : Number(match[4]);
    if (explicitYear !== null && (explicitYear < 1970 || explicitYear > 9999)) {
      return null;
    }
    const year = explicitYear ?? upcomingYear(month, day, clock.now);
    if (!validDay(year, month, day)) {
      return null;
    }
    const timed = extendWithTime(text, match.index + match[0].length);
    return dateFound(match.index, timed, { ...clock.now, year, month, day }, null, clock.timeZone);
  });
}

function matchReminder(text: string, from: number): Found | null {
  return scan(text, from, REMINDER, (match) => {
    if (match[1] === undefined || match[2] === undefined) {
      return null;
    }
    const amount = Number(match[1]);
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
      return null;
    }
    const trigger = reminderTrigger(amount, match[2]);
    if (trigger === null || !parseTrigger(trigger).ok) {
      return null;
    }
    return {
      start: match.index,
      end: match.index + match[0].length,
      kind: 'reminder',
      apply: (draft) => {
        draft.reminderTrigger = trigger;
      },
    };
  });
}

function matchPriority(text: string, from: number): Found | null {
  const match = firstMatch(text, from, PRIORITY_TOKEN);
  if (match === null) {
    return null;
  }
  const word = fold(match[1] ?? (match[2] === undefined ? '' : `p${match[2]}`));
  const priority = BANG_LEVEL[word] ?? PRIORITY_WORD[word];
  if (priority === undefined) {
    return null;
  }
  return {
    start: match.index,
    end: match.index + match[0].length,
    kind: 'priority',
    apply: (draft) => {
      draft.priority = priority;
    },
  };
}

function matchTag(text: string, from: number): Found | null {
  const match = firstMatch(text, from, TAG);
  const name = match?.[1] === undefined ? null : normalizeTagName(match[1]);
  if (match === null || name === null) {
    return null;
  }
  return {
    start: match.index,
    end: match.index + match[0].length,
    kind: 'tag',
    apply: (draft) => {
      if (!draft.tagNames.some((existing) => tagNameKey(existing) === tagNameKey(name))) {
        draft.tagNames.push(name);
      }
    },
  };
}

function matchList(text: string, from: number): Found | null {
  const match = firstMatch(text, from, LIST);
  const name = match?.[1] === undefined ? null : normalizeTagName(match[1]);
  if (match === null || name === null) {
    return null;
  }
  return {
    start: match.index,
    end: match.index + match[0].length,
    kind: 'list',
    apply: (draft) => {
      draft.listName = name;
    },
  };
}

function extraMatchers(patterns: readonly QuickAddPattern[]): Matcher[] {
  return patterns.map((pattern) => {
    if (pattern.source.trim().length === 0) {
      throw new Error('invalid quick add pattern');
    }
    let regex: RegExp;
    try {
      regex = new RegExp(pattern.source, 'gu');
    } catch {
      throw new Error('invalid quick add pattern');
    }
    return (text: string, from: number): Found | null =>
      scan(text, from, regex, (match) => {
        if (match[0].length === 0) {
          return null;
        }
        const apply = applyPattern(pattern.kind, pattern.value ?? match[1]);
        if (apply === null) {
          return null;
        }
        return {
          start: match.index,
          end: match.index + match[0].length,
          kind: pattern.kind,
          apply,
        };
      });
  });
}

function applyPattern(
  kind: QuickAddSpanKind,
  captured: string | undefined,
): ((draft: Draft) => void) | null {
  if (kind === 'priority') {
    if (captured === undefined || !isPriority(captured)) {
      return null;
    }
    return (draft) => {
      draft.priority = captured;
    };
  }
  if (kind === 'tag') {
    const name = captured === undefined ? null : normalizeTagName(captured);
    if (name === null) {
      return null;
    }
    return (draft) => {
      draft.tagNames.push(name);
    };
  }
  if (kind === 'list') {
    const name = captured === undefined ? null : normalizeTagName(captured);
    if (name === null) {
      return null;
    }
    return (draft) => {
      draft.listName = name;
    };
  }
  if (kind === 'reminder') {
    if (captured === undefined || !parseTrigger(captured).ok) {
      return null;
    }
    return (draft) => {
      draft.reminderTrigger = captured;
    };
  }
  if (captured === undefined) {
    return () => undefined;
  }
  if (captured.startsWith('RRULE:')) {
    const parsed = parseRepeatRule(captured);
    if (!parsed.ok) {
      return null;
    }
    const rule = `RRULE:${parsed.rule.rruleBody}`;
    return (draft) => {
      draft.repeatRule = rule;
    };
  }
  if (Number.isNaN(Date.parse(captured))) {
    return null;
  }
  const date = new Date(captured).toISOString();
  return (draft) => {
    draft.due = { date, isAllDay: false };
    draft.repeatRule = null;
  };
}

function dateFound(
  start: number,
  timed: { readonly end: number; readonly clock: Clock | null },
  day: WallClock,
  repeatRule: string | null,
  _timeZone: string,
  weekday: Weekday | null = null,
  slot: 'due' | 'when' = 'due',
): Found | null {
  return {
    start,
    end: timed.end,
    kind: 'date',
    apply: (draft) => {
      draft.dates.push({
        start,
        end: timed.end,
        day,
        clock: timed.clock,
        repeatRule,
        weekday,
        resolved: null,
        slot,
      });
    },
  };
}

function extendWithTime(text: string, from: number): { end: number; clock: Clock | null } {
  const slice = text.slice(from);
  const match =
    /^(?:\s+(?:a\s+las|at))?(?:\s+(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?|\s+(\d{1,2})\s*([ap])\.?m\.?)/iu.exec(
      slice,
    );
  if (match === null) {
    return { end: from, clock: null };
  }
  const clock = clockFrom(match[1] ?? match[4], match[2], match[3] ?? match[5]);
  if (clock === null) {
    return { end: from, clock: null };
  }
  const end = from + match[0].length;
  const next = text[end];
  if (next !== undefined && /[\p{L}\p{N}]/u.test(next)) {
    return { end: from, clock: null };
  }
  return { end, clock };
}

function clockFrom(
  hourText: string | undefined,
  minuteText: string | undefined,
  ampm: string | undefined,
): Clock | null {
  if (hourText === undefined) {
    return null;
  }
  let hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59 || minute < 0) {
    return null;
  }
  if (ampm !== undefined) {
    const marker = ampm.toLocaleLowerCase('es');
    if (hour < 1 || hour > 12) {
      return null;
    }
    if (marker === 'a') {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute };
}

function relativeDays(phrase: string): number | null {
  const key = fold(phrase).replace(/\s+/gu, ' ');
  if (key === 'hoy' || key === 'today') {
    return 0;
  }
  if (key === 'mañana' || key === 'tomorrow') {
    return 1;
  }
  if (key === 'pasado mañana' || key === 'day after tomorrow') {
    return 2;
  }
  return null;
}

function frequencyOf(word: string): 'daily' | 'weekly' | 'monthly' | 'yearly' | null {
  if (word === 'día' || word === 'dia' || word === 'day') {
    return 'daily';
  }
  if (word === 'semana' || word === 'week') {
    return 'weekly';
  }
  if (word === 'mes' || word === 'month') {
    return 'monthly';
  }
  if (word === 'año' || word === 'ano' || word === 'year') {
    return 'yearly';
  }
  return null;
}

function dayAndMonth(
  first: number,
  second: number,
  prefix: string | undefined,
  language: QuickAddLanguage,
): { day: number; month: number } | null {
  const dayFirst = prefix === 'el' || (prefix !== 'on' && language !== 'en');
  const preferDayFirst = first > 12 ? true : second > 12 ? false : dayFirst;
  const day = preferDayFirst ? first : second;
  const month = preferDayFirst ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { day, month };
}

function upcomingYear(month: number, day: number, today: WallClock): number {
  if (month < today.month || (month === today.month && day < today.day)) {
    return today.year + 1;
  }
  return today.year;
}

function validDay(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function reminderTrigger(amount: number, unit: string): string | null {
  const key = fold(unit);
  if (key.startsWith('min')) {
    return `TRIGGER:-PT${String(amount)}M`;
  }
  if (key.startsWith('h')) {
    return `TRIGGER:-PT${String(amount)}H`;
  }
  if (key.startsWith('d')) {
    return `TRIGGER:-P${String(amount)}D`;
  }
  return null;
}

function ruleOf(draft: Parameters<typeof buildRepeatRule>[0]): string | null {
  const built = buildRepeatRule(draft);
  return built.ok ? built.rule : null;
}

function weekdayIndex(day: Weekday): number {
  const order: readonly Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return order.indexOf(day);
}

function weekdayIndexOf(wall: WallClock): number {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
}

function nextWeekdayDelta(wall: WallClock): number {
  const day = weekdayIndexOf(wall);
  if (day === 0) {
    return 1;
  }
  if (day === 6) {
    return 2;
  }
  return 0;
}

function settleSchedule(draft: Draft, clock: ClockContext | null): QuickAddSpan[] {
  if (clock === null) {
    return [];
  }
  if (draft.dates.length === 0) {
    const dropped = settleBareClock(draft, clock);
    finishCapture(draft);
    return dropped;
  }
  const winning = draft.dates[draft.dates.length - 1];
  if (winning === undefined) {
    return [];
  }
  if (winning.resolved !== null) {
    draft.due = winning.resolved;
    draft.repeatRule = winning.repeatRule;
    assignSlots(draft, clock);
    return draft.clocks.map((item) => ({
      start: item.start,
      end: item.end,
      kind: 'date' as const,
    }));
  }
  if (winning.clock !== null) {
    draft.due = dueForAnchor(winning, winning.clock, clock);
    draft.repeatRule = winning.repeatRule;
    assignSlots(draft, clock);
    return draft.clocks.map((item) => ({
      start: item.start,
      end: item.end,
      kind: 'date' as const,
    }));
  }
  if (draft.clocks.length === 0) {
    draft.due = dueForAnchor(winning, null, clock);
    draft.repeatRule = winning.repeatRule;
    assignSlots(draft, clock);
    return [];
  }
  const chosen = closestClock(winning, draft.clocks);
  draft.due = dueForAnchor(winning, chosen.clock, clock);
  draft.repeatRule = winning.repeatRule;
  assignSlots(draft, clock);
  return draft.clocks
    .filter((item) => item !== chosen)
    .map((item) => ({ start: item.start, end: item.end, kind: 'date' as const }));
}

function assignSlots(draft: Draft, clock: ClockContext): void {
  let sawDue = false;
  let sawWhen = false;
  for (const anchor of draft.dates) {
    const time =
      anchor.clock ?? (draft.clocks.length === 0 ? null : closestClock(anchor, draft.clocks).clock);
    const resolved = anchor.resolved ?? dueForAnchor(anchor, time, clock);
    if (anchor.slot === 'when') {
      draft.start = resolved;
      sawWhen = true;
    } else {
      draft.due = resolved;
      sawDue = true;
    }
    if (anchor.repeatRule !== null) {
      draft.repeatRule = anchor.repeatRule;
    }
  }
  if (sawWhen && !sawDue) {
    draft.due = null;
  }
  finishCapture(draft);
}

function finishCapture(draft: Draft): void {
  if (!draft.someday) {
    return;
  }
  draft.due = null;
  draft.start = null;
  draft.eveningOnly = false;
}

function settleBareClock(draft: Draft, clock: ClockContext): QuickAddSpan[] {
  const chosen = draft.clocks[draft.clocks.length - 1];
  if (chosen === undefined) {
    return [];
  }
  const day = chosen.clock.hour < clock.now.hour ? addCalendarDays(clock.now, 1) : clock.now;
  const date = instantFromWall(
    { ...day, hour: chosen.clock.hour, minute: chosen.clock.minute, second: 0 },
    clock.timeZone,
  );
  draft.due = date === null ? null : { date, isAllDay: false };
  draft.repeatRule = null;
  finishCapture(draft);
  return draft.clocks
    .filter((item) => item !== chosen)
    .map((item) => ({ start: item.start, end: item.end, kind: 'date' as const }));
}

function dueForAnchor(
  anchor: DateAnchor,
  time: Clock | null,
  clock: ClockContext,
): QuickAddDue | null {
  const day = anchor.weekday === null ? anchor.day : weekdayAhead(clock.now, anchor.weekday, time);
  const wall =
    time === null
      ? { ...day, hour: 0, minute: 0, second: 0 }
      : { ...day, hour: time.hour, minute: time.minute, second: 0 };
  const date = instantFromWall(wall, clock.timeZone);
  return date === null ? null : { date, isAllDay: time === null };
}

function weekdayAhead(now: WallClock, weekday: Weekday, time: Clock | null): WallClock {
  const target = weekdayIndex(weekday);
  const today = weekdayIndexOf(now);
  let delta = (target - today + 7) % 7;
  if (delta === 0) {
    const stillAhead =
      time !== null &&
      (time.hour > now.hour || (time.hour === now.hour && time.minute > now.minute));
    if (!stillAhead) {
      delta = 7;
    }
  }
  return addCalendarDays(now, delta);
}

function closestClock(date: DateAnchor, clocks: readonly ClockAnchor[]): ClockAnchor {
  let best = clocks[0];
  if (best === undefined) {
    throw new Error('expected a clock');
  }
  let bestDistance = Math.abs(best.start - date.end);
  for (const item of clocks.slice(1)) {
    const distance = Math.abs(item.start - date.end);
    if (distance < bestDistance || (distance === bestDistance && item.start < best.start)) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

function offsetAmount(raw: string): number | null {
  const key = fold(raw);
  if (key === 'un' || key === 'una') {
    return 1;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function offsetUnit(raw: string): 'minute' | 'hour' | 'day' | 'week' | null {
  const key = fold(raw);
  if (key.startsWith('min')) {
    return 'minute';
  }
  if (key.startsWith('hora')) {
    return 'hour';
  }
  if (key.startsWith('d')) {
    return 'day';
  }
  if (key.startsWith('semana')) {
    return 'week';
  }
  return null;
}

function offsetDue(
  clock: ClockContext,
  amount: number,
  unit: 'minute' | 'hour' | 'day' | 'week',
): QuickAddDue | null {
  if (unit === 'minute' || unit === 'hour') {
    const ms = amount * (unit === 'minute' ? 60_000 : 3_600_000);
    return { date: new Date(Date.parse(clock.nowIso) + ms).toISOString(), isAllDay: false };
  }
  const day = addCalendarDays(clock.now, unit === 'week' ? amount * 7 : amount);
  const date = instantFromWall({ ...day, hour: 0, minute: 0, second: 0 }, clock.timeZone);
  return date === null ? null : { date, isAllDay: true };
}

function dayPartClock(hour: number, minute: number, part: string | undefined): Clock | null {
  if (
    part === undefined ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const key = fold(part);
  if (key === 'mañana') {
    if (hour === 12) {
      return { hour: 0, minute };
    }
    return hour >= 1 && hour <= 11 ? { hour, minute } : null;
  }
  if (key === 'tarde') {
    return hour >= 1 && hour <= 7 ? { hour: hour + 12, minute } : null;
  }
  if (key === 'noche') {
    if (hour === 12) {
      return { hour: 0, minute };
    }
    return hour >= 8 && hour <= 11 ? { hour: hour + 12, minute } : null;
  }
  return null;
}

function dayPartFollows(text: string, index: number): boolean {
  return /^\s+de\s+la\s+(?:mañana|tarde|noche)(?![\p{L}\p{N}])/iu.test(text.slice(index));
}

function titleWithout(text: string, spans: readonly QuickAddSpan[]): string {
  let cursor = 0;
  let out = '';
  for (const span of spans) {
    let start = span.start;
    while (start > cursor && /\s/u.test(text[start - 1] ?? '')) {
      start -= 1;
    }
    if (start > cursor && (text[start - 1] === ',' || text[start - 1] === ';')) {
      start -= 1;
    }
    out += text.slice(cursor, start);
    cursor = span.end;
    while (cursor < text.length && (text[cursor] === ',' || text[cursor] === ';')) {
      cursor += 1;
    }
  }
  out += text.slice(cursor);
  return out.replace(/\s+/gu, ' ').trim();
}

function scan(
  text: string,
  from: number,
  source: RegExp,
  accept: (match: RegExpExecArray) => Found | null,
): Found | null {
  let cursor = from;
  while (cursor < text.length) {
    const match = firstMatch(text, cursor, source);
    if (match === null) {
      return null;
    }
    const found = accept(match);
    if (found !== null) {
      return found;
    }
    const next = match.index + Math.max(match[0].length, 1);
    if (next <= cursor) {
      return null;
    }
    cursor = next;
  }
  return null;
}

function firstMatch(text: string, from: number, source: RegExp): RegExpExecArray | null {
  const flags = source.flags.includes('g') ? source.flags : `${source.flags}g`;
  const regex = new RegExp(source.source, flags);
  regex.lastIndex = from;
  const match = regex.exec(text);
  if (match === null || match.index < from) {
    return null;
  }
  return match;
}

function fold(value: string): string {
  return value.toLocaleLowerCase('es');
}
