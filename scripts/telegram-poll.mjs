/**
 * Local Telegram poller (RF-2003). The laptop asks Telegram for new messages
 * and calls the public API. Production uses the webhook once the app is public.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { parseTelegramCommand } = require('../packages/domain/dist/integrations/telegram.js');

const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const api = process.env.LOCAL_API_URL ?? 'http://127.0.0.1:3000';
const email = process.env.SEED_USER_EMAIL ?? 'demo@reflexionia.test';
const offsetFile = join(tmpdir(), 'ticktackdone-telegram-offset');

if (token.length === 0) {
  console.error('[telegram] TELEGRAM_BOT_TOKEN is missing');
  process.exit(1);
}

const bot = `https://api.telegram.org/bot${token}`;

async function telegram(method, body) {
  const response = await fetch(`${bot}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json();
  if (payload.ok !== true) {
    throw new Error(`${method} failed`);
  }
  return payload.result;
}

async function app(method, path, body, key) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-dev-user-email': email,
      ...(key === undefined ? {} : { 'idempotency-key': key }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text.length === 0 ? null : JSON.parse(text);
  if (!response.ok) {
    const message = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function items(page) {
  return Array.isArray(page?.items) ? page.items : [];
}

function madridParts(instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function madridOffsetMs(instant) {
  const parts = madridParts(instant);
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

function madridMidnight(year, month, day) {
  const wall = Date.UTC(year, month - 1, day);
  const corrected = wall - madridOffsetMs(new Date(wall - madridOffsetMs(new Date(wall))));
  return new Date(corrected);
}

function addCalendarDays(year, month, day, offset) {
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function spanFrom(startOffsetDays, lengthDays) {
  const today = madridParts(new Date());
  const startDate = addCalendarDays(today.year, today.month, today.day, startOffsetDays);
  const endDate = addCalendarDays(startDate.year, startDate.month, startDate.day, lengthDays);
  const start = madridMidnight(startDate.year, startDate.month, startDate.day);
  const end = madridMidnight(endDate.year, endDate.month, endDate.day);
  return {
    after: new Date(start.getTime() - 1).toISOString(),
    before: end.toISOString(),
  };
}

function daySpan(offsetDays) {
  return spanFrom(offsetDays, 1);
}

function weekSpan() {
  const today = madridParts(new Date());
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return spanFrom(mondayOffset, 7);
}

function say(text) {
  return { text, html: false };
}

function webBase() {
  const configured = process.env.APP_WEB_URL?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:5173';
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function checklist(title, rows, names, withList, path) {
  const lines = rows.map((row) => {
    const list = names.get(row.project_id);
    const name = withList && list !== undefined ? `${row.title} — ${list}` : row.title;
    return `☐ ${escapeHtml(name)}`;
  });
  const href = `${webBase()}${path}`;
  return {
    text: `${escapeHtml(title)}\n${lines.join('\n')}\n\n<a href="${href}">Ver en la app</a>`,
    html: true,
  };
}

async function projectNames() {
  const projects = items(await app('GET', '/api/v1/projects?limit=100'));
  return new Map(projects.map((row) => [row.id, row.name]));
}

async function datedTasks(span) {
  const page = await app(
    'GET',
    `/api/v1/tasks?status=active&limit=8&due_after=${encodeURIComponent(span.after)}&due_before=${encodeURIComponent(span.before)}`,
  );
  return items(page);
}

async function replyFor(text, key) {
  const cleaned = text.trim().replace(/^\/([a-z_]+)@\w+/i, '/$1');
  if (cleaned === '/start') {
    return say('Escribe una tarea, o usa /capturar, /hoy, /manana, /semana y /lista.');
  }
  const command = parseTelegramCommand(cleaned);
  if (command.kind === 'capture' && command.text.length === 0) {
    return say('Escribe la tarea detrás: /capturar comprar leche mañana');
  }
  if (command.kind === 'capture' && command.text.startsWith('/')) {
    return say('Ese comando no existe. Usa /capturar, /hoy, /manana, /semana o /lista.');
  }
  if (command.kind === 'capture') {
    const created = await app('POST', '/api/v1/tasks', { raw_text: command.text }, key);
    const missed = Array.isArray(created.warnings)
      ? created.warnings.find((item) => item.code === 'list_not_found')
      : undefined;
    const listNote =
      missed === undefined
        ? ''
        : ` La lista «${missed.name}» no existe, así que quedó en la bandeja.`;
    return say(`Guardada: ${created.title ?? command.text}.${listNote}`);
  }
  if (command.kind === 'today' || command.kind === 'tomorrow' || command.kind === 'week') {
    const span =
      command.kind === 'today' ? daySpan(0) : command.kind === 'tomorrow' ? daySpan(1) : weekSpan();
    const rows = await datedTasks(span);
    const empty =
      command.kind === 'today'
        ? 'Hoy no hay tareas con fecha.'
        : command.kind === 'tomorrow'
          ? 'Mañana no hay tareas con fecha.'
          : 'Esta semana no hay tareas con fecha.';
    if (rows.length === 0) {
      return say(empty);
    }
    const names = await projectNames();
    const title =
      command.kind === 'today' ? 'Hoy' : command.kind === 'tomorrow' ? 'Mañana' : 'Esta semana';
    const path =
      command.kind === 'today'
        ? '/today'
        : command.kind === 'tomorrow'
          ? '/smart/tomorrow'
          : '/calendar/week';
    return checklist(title, rows, names, true, path);
  }
  if (command.kind === 'lists') {
    const projects = items(await app('GET', '/api/v1/projects?limit=100'));
    if (projects.length === 0) {
      return say('No hay listas.');
    }
    const lines = projects.map((row) => `☐ ${escapeHtml(String(row.name))}`).join('\n');
    return {
      text: `${lines}\n\n<a href="${webBase()}/today">Ver en la app</a>`,
      html: true,
    };
  }
  if (command.kind === 'tag') {
    if (command.name.length === 0) {
      return say('Escribe la etiqueta: /lista #5min');
    }
    const tags = items(await app('GET', '/api/v1/tags?limit=100'));
    const tag = tags.find((row) => String(row.name).toLowerCase() === command.name.toLowerCase());
    if (tag === undefined) {
      return say(`No encuentro la etiqueta «${command.name}».`);
    }
    const rows = items(
      await app('GET', `/api/v1/tasks?status=active&limit=8&tag=${encodeURIComponent(tag.id)}`),
    );
    if (rows.length === 0) {
      return say(`No hay tareas con #${tag.name}.`);
    }
    return checklist(
      `#${tag.name}`,
      rows,
      await projectNames(),
      true,
      `/search?q=${encodeURIComponent(tag.name)}`,
    );
  }
  if (command.kind === 'priority') {
    const label = command.level === 'high' ? 'alta' : command.level === 'medium' ? 'media' : 'baja';
    const rows = items(
      await app('GET', `/api/v1/tasks?status=active&limit=8&priority=${command.level}`),
    );
    if (rows.length === 0) {
      return say(`No hay tareas con prioridad ${label}.`);
    }
    return checklist(`Prioridad ${label}`, rows, await projectNames(), true, '/matrix');
  }
  if (command.kind === 'list') {
    const projects = items(await app('GET', '/api/v1/projects?limit=100'));
    const wanted = command.name.toLowerCase();
    const project = projects.find((row) => String(row.name).toLowerCase() === wanted);
    if (project === undefined) {
      return say(`No encuentro la lista «${command.name}».`);
    }
    const rows = items(
      await app(
        'GET',
        `/api/v1/tasks?status=active&limit=8&project_id=${encodeURIComponent(project.id)}`,
      ),
    );
    if (rows.length === 0) {
      return say(`«${project.name}» no tiene tareas activas.`);
    }
    const path = project.is_inbox === true ? '/inbox' : `/list/${project.id}`;
    return checklist(project.name, rows, new Map(), false, path);
  }
  return say('No reconozco ese mensaje.');
}

async function remember(chatId) {
  try {
    await app('POST', '/api/v1/integrations/telegram/link', { chat_id: String(chatId) });
  } catch {
    // Linking is optional for the reply.
  }
}

async function handle(update) {
  const message = update.message;
  const chatId = message?.chat?.id;
  if (chatId === undefined) {
    return;
  }
  await remember(chatId);
  let reply;
  if (typeof message.text === 'string' && message.text.trim().length > 0) {
    try {
      reply = await replyFor(message.text, `telegram-${update.update_id}`);
    } catch (error) {
      reply = say(`No he podido hacerlo. ${error instanceof Error ? error.message : 'Error'}`);
    }
  } else if (message.voice !== undefined || message.photo !== undefined) {
    reply = say('He recibido el archivo. La voz y la foto todavía no se convierten en tarea.');
  } else {
    return;
  }
  await telegram('sendMessage', {
    chat_id: chatId,
    text: reply.text,
    ...(reply.html ? { parse_mode: 'HTML' } : {}),
  });
  console.log(`[telegram] update ${update.update_id} answered`);
}

async function handleCallback(query) {
  const data = typeof query.data === 'string' ? query.data : '';
  const chatId = query.message?.chat?.id;
  if (!data.startsWith('c:') || chatId === undefined) {
    await telegram('answerCallbackQuery', { callback_query_id: query.id });
    return;
  }
  try {
    await app('POST', `/api/v1/tasks/${data.slice(2)}/complete`, {}, `telegram-${query.id}`);
    await telegram('answerCallbackQuery', { callback_query_id: query.id, text: 'Completada' });
    const rows = query.message?.reply_markup?.inline_keyboard ?? [];
    await telegram('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: rows.map((row) =>
          row.map((button) =>
            button.callback_data === data
              ? { text: button.text.replace(/^☐ /, '✓ ').slice(0, 64) }
              : button,
          ),
        ),
      },
    });
  } catch (error) {
    await telegram('answerCallbackQuery', {
      callback_query_id: query.id,
      text: error instanceof Error ? error.message : 'No he podido completarla',
      show_alert: true,
    });
  }
}

async function savedOffset() {
  try {
    const raw = await readFile(offsetFile, 'utf8');
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

await telegram('deleteWebhook', {});
let offset = await savedOffset();
console.log('[telegram] polling');

for (;;) {
  try {
    const updates = await telegram('getUpdates', {
      timeout: 25,
      allowed_updates: ['message', 'callback_query'],
      ...(offset === undefined ? {} : { offset }),
    });
    for (const update of updates) {
      if (update.callback_query !== undefined) {
        await handleCallback(update.callback_query);
      } else {
        await handle(update);
      }
      offset = update.update_id + 1;
      await writeFile(offsetFile, String(offset));
    }
  } catch (error) {
    console.error(`[telegram] ${error instanceof Error ? error.message : 'request failed'}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
