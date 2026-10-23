/** A Telegram update reduced to what the bot acts on. RF-2003. */

export interface TelegramIncoming {
  readonly username?: string;
  readonly displayName?: string;
  readonly chatId: string;
  readonly updateId: string;
  readonly kind: 'text' | 'voice' | 'photo' | 'callback';
  readonly text: string;
  readonly fileId: string;
  readonly caption: string;
  readonly callbackId: string;
  readonly callbackData: string;
  readonly messageId: number | null;
  readonly messageText: string | null;
}

export function readTelegramUpdate(body: unknown): TelegramIncoming | null {
  const update = asRecord(body);
  if (update === null) {
    return null;
  }
  const updateId = typeof update.update_id === 'number' ? String(update.update_id) : '0';
  const callback = asRecord(update.callback_query);
  if (callback !== null) {
    const message = asRecord(callback.message);
    const chatId = idOf(asRecord(message?.chat)?.id);
    if (chatId === null) {
      return null;
    }
    return {
      chatId,
      updateId,
      kind: 'callback',
      text: '',
      fileId: '',
      caption: '',
      callbackId: typeof callback.id === 'string' ? callback.id : '',
      callbackData: typeof callback.data === 'string' ? callback.data : '',
      messageId: typeof message?.message_id === 'number' ? message.message_id : null,
      messageText: typeof message?.text === 'string' ? message.text : null,
    };
  }
  const message = asRecord(update.message);
  if (message === null) {
    return null;
  }
  const chatId = idOf(asRecord(message.chat)?.id);
  if (chatId === null) {
    return null;
  }
  if (typeof message.text === 'string' && message.text.trim().length > 0) {
    return {
      ...incoming(chatId, updateId, 'text', { text: message.text }),
      ...profile(message.from),
    };
  }
  const voice = asRecord(message.voice);
  if (voice !== null && typeof voice.file_id === 'string') {
    return incoming(chatId, updateId, 'voice', { fileId: voice.file_id });
  }
  const photos = Array.isArray(message.photo) ? message.photo : [];
  const last = photos.length === 0 ? null : asRecord(photos[photos.length - 1]);
  if (last !== null && typeof last.file_id === 'string') {
    return incoming(chatId, updateId, 'photo', {
      fileId: last.file_id,
      ...(typeof message.caption === 'string' ? { caption: message.caption } : {}),
    });
  }
  return null;
}

function incoming(
  chatId: string,
  updateId: string,
  kind: TelegramIncoming['kind'],
  extra: Partial<Pick<TelegramIncoming, 'text' | 'fileId' | 'caption'>>,
): TelegramIncoming {
  return {
    chatId,
    updateId,
    kind,
    text: extra.text ?? '',
    fileId: extra.fileId ?? '',
    caption: extra.caption ?? '',
    callbackId: '',
    callbackData: '',
    messageId: null,
    messageText: null,
  };
}

function idOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function profile(value: unknown): { username?: string; displayName?: string } {
  const row = asRecord(value);
  if (!row) return {};
  const name = [row.first_name, row.last_name]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .trim()
    .slice(0, 200);
  return {
    ...(typeof row.username === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(row.username)
      ? { username: row.username }
      : {}),
    ...(name ? { displayName: name } : {}),
  };
}
