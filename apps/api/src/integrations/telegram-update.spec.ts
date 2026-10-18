import { describe, expect, it } from 'vitest';
import { readTelegramUpdate } from './telegram-update';

describe('telegram updates', () => {
  it('RF-2003: reads text, voice, photo and a completion button', () => {
    expect(
      readTelegramUpdate({ update_id: 1, message: { chat: { id: 7 }, text: '/hoy' } })?.kind,
    ).toBe('text');
    expect(
      readTelegramUpdate({
        update_id: 2,
        message: { chat: { id: 7 }, voice: { file_id: 'v' } },
      })?.fileId,
    ).toBe('v');
    expect(
      readTelegramUpdate({
        update_id: 3,
        message: {
          chat: { id: 7 },
          caption: 'ticket',
          photo: [{ file_id: 'small' }, { file_id: 'large' }],
        },
      }),
    ).toEqual(expect.objectContaining({ kind: 'photo', fileId: 'large', caption: 'ticket' }));
    expect(
      readTelegramUpdate({
        update_id: 4,
        callback_query: { id: 'q', data: 'c:abc', message: { message_id: 9, chat: { id: 7 } } },
      }),
    ).toEqual(expect.objectContaining({ kind: 'callback', callbackData: 'c:abc', messageId: 9 }));
    expect(readTelegramUpdate({ update_id: 5 })).toBeNull();
  });
});
