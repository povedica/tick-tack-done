/** RF-2003. Text commands the bot understands before it calls the API. */

export type TelegramCommand =
  | { readonly kind: 'today' }
  | { readonly kind: 'list'; readonly name: string }
  | { readonly kind: 'complete'; readonly taskId: string }
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
  const list = /^(?:\/lista|qué hay en|que hay en)\s+(.+)$/i.exec(trimmed);
  if (list?.[1] !== undefined) {
    return { kind: 'list', name: list[1].trim() };
  }
  const complete = /^\/complete\s+([0-9a-f-]{36})$/i.exec(trimmed);
  if (complete?.[1] !== undefined) {
    return { kind: 'complete', taskId: complete[1] };
  }
  return { kind: 'capture', text: trimmed };
}
