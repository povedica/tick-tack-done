import type { QuickAddSpan, QuickAddSpanKind } from '@reflexionia/domain';

export interface TextSegment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly kind: QuickAddSpanKind | null;
}

/** RF-102. Spans keep the offsets of the original text so the highlight matches the editor. */
export function textSegments(text: string, spans: readonly QuickAddSpan[]): TextSegment[] {
  const ordered = [...spans]
    .filter((span) => span.start >= 0 && span.end > span.start && span.end <= text.length)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const parts: TextSegment[] = [];
  let cursor = 0;
  for (const span of ordered) {
    if (span.start < cursor) {
      continue;
    }
    if (span.start > cursor) {
      parts.push({
        text: text.slice(cursor, span.start),
        start: cursor,
        end: span.start,
        kind: null,
      });
    }
    parts.push({
      text: text.slice(span.start, span.end),
      start: span.start,
      end: span.end,
      kind: span.kind,
    });
    cursor = span.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), start: cursor, end: text.length, kind: null });
  }
  return parts;
}

/** Drop one highlighted token and the space it leaves behind. */
export function removeSpan(text: string, start: number, end: number): string {
  return `${text.slice(0, start)}${text.slice(end)}`.replace(/[ \t]{2,}/g, ' ').trim();
}

export function canSubmitTitle(title: string): boolean {
  return title.trim().length > 0;
}

export function appendTranscript(current: string, transcript: string): string {
  const spoken = transcript.trim();
  if (spoken.length === 0) {
    return current;
  }
  if (current.length === 0) {
    return spoken;
  }
  if (current.endsWith(' ') || current.endsWith('\n')) {
    return `${current}${spoken}`;
  }
  return `${current} ${spoken}`;
}

export function isCaptureShortcut(input: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly typing: boolean;
}): boolean {
  if (input.typing || input.metaKey || input.ctrlKey || input.altKey) {
    return false;
  }
  return input.key === 'n' || input.key === 'N';
}
