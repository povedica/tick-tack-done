/** RF-2003. Text commands the bot understands before it calls the API. */

export type TelegramCommand =
  | { readonly kind: 'today' }
  | { readonly kind: 'tomorrow' }
  | { readonly kind: 'week' }
  | { readonly kind: 'lists' }
  | { readonly kind: 'list'; readonly name: string }
  | { readonly kind: 'tag'; readonly name: string }
  | { readonly kind: 'priority'; readonly level: 'high' | 'medium' | 'low' }
  | { readonly kind: 'capture'; readonly text: string };

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
  const list = /^(?:\/lista|qué hay en|que hay en)\s+(.+)$/i.exec(trimmed);
  if (list?.[1] !== undefined) {
    return listFilter(list[1]);
  }
  const capture = /^\/(?:capturar|add)(?:\s+([\s\S]+))?$/i.exec(trimmed);
  if (capture !== null) {
    return { kind: 'capture', text: capture[1]?.trim() ?? '' };
  }
  return { kind: 'capture', text: trimmed };
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
  if (key === 'alta' || key === 'high' || key === 'p3') {
    return 'high';
  }
  if (key === 'media' || key === 'medium' || key === 'p2') {
    return 'medium';
  }
  if (key === 'baja' || key === 'low' || key === 'p1') {
    return 'low';
  }
  return null;
}
