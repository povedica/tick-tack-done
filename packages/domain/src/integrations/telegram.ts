/** RF-2003. Text commands the bot understands before it calls the API. */

export type TelegramCommand =
  | { readonly kind: 'today' }
  | { readonly kind: 'tomorrow' }
  | { readonly kind: 'week' }
  | { readonly kind: 'lists' }
  | { readonly kind: 'list'; readonly name: string }
  | { readonly kind: 'tag'; readonly name: string }
  | { readonly kind: 'priority'; readonly level: 'high' | 'medium' | 'low' }
  | { readonly kind: 'complete'; readonly query: string }
  | { readonly kind: 'create_list'; readonly name: string }
  | { readonly kind: 'capture'; readonly text: string };

export interface TelegramTaskRef {
  readonly id: string;
  readonly title: string;
}

export type TitleMatch =
  | { readonly status: 'one'; readonly id: string; readonly title: string }
  | { readonly status: 'many'; readonly titles: readonly string[] }
  | { readonly status: 'none' };

export function parseTelegramCommand(text: string): TelegramCommand {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === '/hoy' ||
    lower === '¿qué tengo hoy?' ||
    lower === 'que tengo hoy' ||
    lower === '/today'
  ) {
    return { kind: 'today' };
  }
  if (lower === '/manana' || lower === '/mañana' || lower === '/tomorrow') {
    return { kind: 'tomorrow' };
  }
  if (lower === '/semana' || lower === '/week') {
    return { kind: 'week' };
  }
  if (lower === '/lista') {
    return { kind: 'lists' };
  }
  const created = matchCreateList(trimmed);
  if (created !== null) {
    return created;
  }
  const list = /^(?:\/lista|qué hay en|que hay en)\s+(.+)$/i.exec(trimmed);
  if (list?.[1] !== undefined) {
    return listFilter(list[1]);
  }
  const complete = /^(?:\/(?:hecho|completar)|hecho|completar)\s+(.+)$/i.exec(trimmed);
  if (complete?.[1] !== undefined) {
    return { kind: 'complete', query: complete[1].trim() };
  }
  const capture = /^\/(?:capturar|add)(?:\s+([\s\S]+))?$/i.exec(trimmed);
  if (capture !== null) {
    return { kind: 'capture', text: capture[1]?.trim() ?? '' };
  }
  return { kind: 'capture', text: trimmed };
}

/** RF-2003. Completes by title or by 1-based position. The caller never asks for a UUID. */
export function matchTaskByTitle(tasks: readonly TelegramTaskRef[], query: string): TitleMatch {
  const wanted = fold(query);
  if (wanted.length === 0) {
    return { status: 'none' };
  }
  const index = /^(\d+)$/.exec(wanted);
  if (index?.[1] !== undefined) {
    const row = tasks[Number(index[1]) - 1];
    return row === undefined ? { status: 'none' } : { status: 'one', id: row.id, title: row.title };
  }
  const exact = tasks.filter((task) => fold(task.title) === wanted);
  const hits = exact.length > 0 ? exact : tasks.filter((task) => fold(task.title).includes(wanted));
  const first = hits[0];
  if (hits.length === 1 && first !== undefined) {
    return { status: 'one', id: first.id, title: first.title };
  }
  if (hits.length > 1) {
    return { status: 'many', titles: hits.map((task) => task.title).slice(0, 8) };
  }
  return { status: 'none' };
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function matchCreateList(trimmed: string): TelegramCommand | null {
  const patterns = [
    /^\/nuevalista(?:\s+([\s\S]*))?$/i,
    /^\/lista\s+nueva(?:\s+([\s\S]*))?$/i,
    /^\/lista\s+crear(?:\s+([\s\S]*))?$/i,
    /^nueva\s+lista(?:\s+([\s\S]*))?$/i,
    /^crear\s+lista(?:\s+([\s\S]*))?$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(trimmed);
    if (match !== null) {
      return { kind: 'create_list', name: (match[1] ?? '').trim() };
    }
  }
  return null;
}

function listFilter(raw: string): TelegramCommand {
  const value = raw.trim();
  if (value.startsWith('#')) {
    return { kind: 'tag', name: value.slice(1).trim() };
  }
  const level = priorityOf(value);
  if (level !== null) {
    return { kind: 'priority', level };
  }
  return { kind: 'list', name: value };
}

function priorityOf(value: string): 'high' | 'medium' | 'low' | null {
  const key = value.toLowerCase().replace(/^!/, '');
  if (key === 'alta' || key === 'high' || key === 'p1') {
    return 'high';
  }
  if (key === 'media' || key === 'medium' || key === 'p2') {
    return 'medium';
  }
  if (key === 'baja' || key === 'low' || key === 'p3') {
    return 'low';
  }
  return null;
}
