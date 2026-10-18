/**
 * Local Telegram poller (RF-2003). Development only: it deletes the webhook
 * so Telegram delivers updates here, then forwards each one to the API.
 * Production uses scripts/telegram-webhook.mjs once the app is public.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const api = process.env.LOCAL_API_URL ?? 'http://127.0.0.1:3000';
const email = process.env.SEED_USER_EMAIL ?? 'demo@reflexionia.test';
const offsetFile = join(tmpdir(), 'ticktackdone-telegram-offset');

if (token.length === 0) {
  console.error('[telegram] TELEGRAM_BOT_TOKEN is missing');
  process.exit(1);
}

const bot = `https://api.telegram.org/bot${token}`;
const secret = createHash('sha256').update(token).digest('hex');

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

async function link(chatId) {
  const response = await fetch(`${api}/api/v1/integrations/telegram/link`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-user-email': email,
    },
    body: JSON.stringify({ chat_id: String(chatId) }),
  });
  if (!response.ok) {
    throw new Error('link failed');
  }
}

async function forward(update) {
  const response = await fetch(`${api}/api/v1/integrations/telegram/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': secret,
    },
    body: JSON.stringify(update),
  });
  if (!response.ok) {
    throw new Error(`webhook HTTP ${response.status}`);
  }
}

function chatIdOf(update) {
  const message = update.message ?? update.callback_query?.message;
  return message?.chat?.id;
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
      const chatId = chatIdOf(update);
      if (chatId !== undefined) {
        await link(chatId);
      }
      await forward(update);
      offset = update.update_id + 1;
      await writeFile(offsetFile, String(offset));
      console.log(`[telegram] update ${update.update_id} forwarded`);
    }
  } catch (error) {
    console.error(`[telegram] ${error instanceof Error ? error.message : 'request failed'}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
