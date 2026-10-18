import { parseQuickAdd, type QuickAddSpanKind } from '@reflexionia/domain';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, SubmitEvent } from 'react';
import { captureLanguage, fill, useMessages, type Messages } from '../../../i18n';
import { api } from '../api';
import { canSubmitTitle, removeSpan, textSegments } from '../draft';
import type { CaptureWarningNotice } from '../notice';
import { useSpeech } from '../speech';

interface CreatedCapture {
  readonly title: string;
  readonly warnings: readonly CaptureWarningNotice[];
}

export function CaptureSheet({
  initialText,
  onClose,
  onCreated,
}: {
  readonly initialText: string;
  readonly onClose: () => void;
  readonly onCreated: (created: CreatedCapture) => void;
}) {
  const messages = useMessages();
  const language = captureLanguage(navigator.language);
  const timeZone = browserTimeZone();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const speech = useSpeech(language, setText);

  const parsed = useMemo(
    () => parseQuickAdd(text, language, { now: new Date().toISOString(), timeZone }),
    [text, language, timeZone],
  );
  const ready = canSubmitTitle(parsed.title);
  const create = useMutation({
    mutationFn: (rawText: string) => api.createTask({ raw_text: rawText }, crypto.randomUUID()),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function submit(): Promise<void> {
    if (!ready || create.isPending) {
      return;
    }
    setError(null);
    try {
      const task = await create.mutateAsync(text);
      onCreated({
        title: task.title,
        warnings: (task.warnings ?? []).map((warning) =>
          warning.name === undefined
            ? { code: warning.code }
            : { code: warning.code, name: warning.name },
        ),
      });
    } catch {
      setError(messages.createFailed);
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function syncScroll(): void {
    const input = inputRef.current;
    const backdrop = backdropRef.current;
    if (input !== null && backdrop !== null) {
      backdrop.scrollTop = input.scrollTop;
    }
  }

  const segments = textSegments(text, parsed.spans);

  return (
    <div className="sheet">
      <form onSubmit={onSubmit}>
        <h1>{messages.captureTitle}</h1>
        <label className="capture-label" htmlFor="capture-input">
          {messages.captureTitle}
        </label>
        <div className="capture-field">
          <div ref={backdropRef} className="capture-backdrop" aria-hidden="true">
            {segments.map((segment) =>
              segment.kind === null ? (
                <span key={segmentKey(segment.start, segment.end)}>{segment.text}</span>
              ) : (
                <mark
                  key={segmentKey(segment.start, segment.end)}
                  className={`mark-${segment.kind}`}
                >
                  {segment.text}
                </mark>
              ),
            )}
            {'\u200b'}
          </div>
          <textarea
            id="capture-input"
            ref={inputRef}
            className="capture-input"
            value={text}
            placeholder={messages.placeholder}
            rows={3}
            onChange={(event) => {
              setText(event.target.value);
            }}
            onKeyDown={onKeyDown}
            onScroll={syncScroll}
          />
        </div>
        {parsed.spans.length > 0 ? (
          <ul className="chips">
            {parsed.spans.map((span) => (
              <li key={`${span.kind}-${String(span.start)}`}>
                <button
                  type="button"
                  onClick={() => {
                    setText(removeSpan(text, span.start, span.end));
                  }}
                >
                  {kindLabel(messages, span.kind)}: {text.slice(span.start, span.end)}
                  <span className="sr-only">{messages.remove}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="preview">
          {ready ? `${messages.titlePreview}: ${parsed.title}` : messages.emptyTitle}
        </p>
        {error !== null ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <button type="button" onClick={onClose}>
            {messages.cancel}
          </button>
          <button
            type="button"
            onClick={() => {
              speech.toggle(text);
            }}
            disabled={!speech.supported}
            aria-pressed={speech.listening}
          >
            {speech.listening ? messages.voiceStop : messages.voice}
          </button>
          <button type="submit" disabled={!ready || create.isPending}>
            {create.isPending ? messages.saving : messages.confirm}
          </button>
        </div>
        {!speech.supported ? <p className="hint">{messages.voiceUnsupported}</p> : null}
      </form>
    </div>
  );
}

function segmentKey(start: number, end: number): string {
  return `${String(start)}-${String(end)}`;
}

function kindLabel(messages: Messages, kind: QuickAddSpanKind): string {
  switch (kind) {
    case 'date':
      return messages.kindDate;
    case 'priority':
      return messages.kindPriority;
    case 'tag':
      return messages.kindTag;
    case 'list':
      return messages.kindList;
    case 'reminder':
      return messages.kindReminder;
  }
}

function browserTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone.length > 0 ? zone : 'Europe/Madrid';
}

export function warningText(messages: Messages, warning: CaptureWarningNotice): string {
  const name = warning.name ?? '';
  switch (warning.code) {
    case 'list_not_found':
      return fill(messages.listNotFound, name);
    case 'tag_not_found':
      return fill(messages.tagNotFound, name);
    case 'reminder_without_date':
      return messages.reminderWithoutDate;
  }
}
