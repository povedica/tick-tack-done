/**
 * Point Telegram at the public webhook (RF-2003).
 * Run on the server after the app answers on PUBLIC_URL. Do not print the bot token.
 *
 *   bash scripts/with-env.sh node scripts/telegram-webhook.mjs
 */
import { createHash } from 'node:crypto';

const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');

if (token.length === 0 || publicUrl.length === 0) {
  console.error('[telegram] TELEGRAM_BOT_TOKEN and PUBLIC_URL are required');
  process.exit(1);
}

const secret = createHash('sha256').update(token).digest('hex');
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: `${publicUrl}/api/v1/integrations/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  }),
});
const payload = await response.json();
if (payload.ok !== true) {
  console.error('[telegram] setWebhook failed');
  process.exit(1);
}
console.log(`[telegram] webhook set on ${publicUrl}`);

const commands = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    commands: [
      { command: 'capturar', description: 'Guardar una tarea' },
      { command: 'hoy', description: 'Tareas de hoy' },
      { command: 'manana', description: 'Tareas de mañana' },
      { command: 'semana', description: 'Tareas de la semana' },
      { command: 'lista', description: 'Ver listas o filtrar' },
      { command: 'nuevalista', description: 'Crear una lista' },
      { command: 'hecho', description: 'Completar una tarea' },
    ],
  }),
});
const menu = await commands.json();
if (menu.ok !== true) {
  console.error('[telegram] setMyCommands failed');
  process.exit(1);
}
console.log('[telegram] commands set, including /nuevalista');
