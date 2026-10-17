import { parseQuickAdd } from '@reflexionia/domain';
import { describe, expect, it } from 'vitest';
import { captureLanguage, messagesFor } from '../../i18n';
import {
  appendTranscript,
  canSubmitTitle,
  isCaptureShortcut,
  removeSpan,
  textSegments,
} from './draft';
import { draftFromShare, shareTargetRedirect } from './share-target';

const clock = { now: '2026-10-17T10:00:00.000Z', timeZone: 'Europe/Madrid' };

describe('capture', () => {
  it('RF-101: N opens capture unless a modifier is held or the user is typing', () => {
    expect(
      isCaptureShortcut({ key: 'n', metaKey: false, ctrlKey: false, altKey: false, typing: false }),
    ).toBe(true);
    expect(
      isCaptureShortcut({ key: 'N', metaKey: false, ctrlKey: false, altKey: false, typing: false }),
    ).toBe(true);
    expect(
      isCaptureShortcut({ key: 'n', metaKey: true, ctrlKey: false, altKey: false, typing: false }),
    ).toBe(false);
    expect(
      isCaptureShortcut({ key: 'n', metaKey: false, ctrlKey: false, altKey: false, typing: true }),
    ).toBe(false);
  });

  it('RF-102: highlights keep the offsets of the original text and a chip removes that slice', () => {
    const text = 'comprar leche mañana 18:00 !alta #casa';
    const parsed = parseQuickAdd(text, 'es', clock);
    const priority = parsed.spans.find((span) => span.kind === 'priority');
    const date = parsed.spans.find((span) => span.kind === 'date');
    expect(priority).toBeDefined();
    expect(date).toBeDefined();
    if (priority === undefined || date === undefined) {
      return;
    }
    expect(text.slice(priority.start, priority.end)).toBe('!alta');
    expect(text.slice(date.start, date.end)).toContain('18:00');
    const segments = textSegments(text, parsed.spans);
    expect(segments.find((segment) => segment.kind === 'tag')?.text).toBe('#casa');
    expect(removeSpan(text, priority.start, priority.end)).toBe('comprar leche mañana 18:00 #casa');
    expect(parsed.title).toBe('comprar leche');
  });

  it('RF-104: dictation is appended to the same draft', () => {
    expect(appendTranscript('', 'comprar leche')).toBe('comprar leche');
    expect(appendTranscript('comprar', 'leche mañana')).toBe('comprar leche mañana');
    expect(appendTranscript('comprar ', 'leche')).toBe('comprar leche');
    expect(appendTranscript('comprar', '   ')).toBe('comprar');
  });

  it('RF-106: a share target becomes the quick-add draft and a GET redirect', () => {
    expect(
      draftFromShare({
        title: 'Lista',
        text: 'comprar leche',
        url: 'https://example.com/nota',
      }),
    ).toBe('Lista\ncomprar leche\nhttps://example.com/nota');
    expect(draftFromShare({ title: '  ', text: '', url: 'https://example.com' })).toBe(
      'https://example.com',
    );
    const location = shareTargetRedirect('https://todo.reflexionia.com', {
      title: 'Lista',
      text: 'comprar',
      url: '',
    });
    expect(location).toBe('https://todo.reflexionia.com/quick-add?title=Lista&text=comprar');
  });

  it('RF-107: an empty parsed title does not submit', () => {
    expect(canSubmitTitle('')).toBe(false);
    expect(canSubmitTitle('   ')).toBe(false);
    const parsed = parseQuickAdd('!alta', 'es', clock);
    expect(canSubmitTitle(parsed.title)).toBe(false);
    expect(canSubmitTitle(parseQuickAdd('comprar leche', 'es', clock).title)).toBe(true);
  });

  it('uses Spanish copy by default and English when the locale starts with en', () => {
    expect(messagesFor('es-ES').fab).toBe('Nueva tarea');
    expect(messagesFor('en-US').confirm).toBe('Create task');
    expect(captureLanguage('en-GB')).toBe('en');
    expect(captureLanguage('es')).toBe('es');
  });
});
