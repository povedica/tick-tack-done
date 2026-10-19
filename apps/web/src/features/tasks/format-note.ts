export type NoteFormat =
  | 'heading'
  | 'bold'
  | 'highlight'
  | 'check'
  | 'bullet'
  | 'ordered'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'rule'
  | 'date'
  | 'link'
  | 'code'
  | 'quote';

export interface FormatResult {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

const WRAP: Partial<Record<NoteFormat, readonly [string, string]>> = {
  bold: ['**', '**'],
  highlight: ['==', '=='],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
  strike: ['~~', '~~'],
  code: ['`', '`'],
};

const LINE: Partial<Record<NoteFormat, string>> = {
  heading: '# ',
  check: '- [ ] ',
  bullet: '- ',
  ordered: '1. ',
  quote: '> ',
};

export function applyFormat(
  value: string,
  start: number,
  end: number,
  kind: NoteFormat,
  insert = '',
): FormatResult {
  if (kind === 'link') {
    return insertLink(value, start, end);
  }
  const wrap = WRAP[kind];
  if (wrap !== undefined) {
    return toggleWrap(value, start, end, wrap[0], wrap[1], '');
  }
  const prefix = LINE[kind];
  if (prefix !== undefined) {
    return toggleLines(value, start, end, prefix);
  }
  if (kind === 'rule') {
    return insertBlock(value, start, end, '---');
  }
  return insertBlock(value, start, end, insert);
}

function toggleWrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): FormatResult {
  const selected = value.slice(start, end);
  if (
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after
  ) {
    const next = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
    const caret = start - before.length;
    return { value: next, start: caret, end: caret + selected.length };
  }
  if (
    selected.startsWith(before) &&
    selected.endsWith(after) &&
    selected.length >= before.length + after.length
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    const next = value.slice(0, start) + inner + value.slice(end);
    return { value: next, start, end: start + inner.length };
  }
  const inner = selected.length > 0 ? selected : placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  const caret = start + before.length;
  return { value: next, start: caret, end: caret + inner.length };
}

function insertLink(value: string, start: number, end: number): FormatResult {
  const selected = value.slice(start, end);
  const inner = selected.length > 0 ? selected : 'enlace';
  const url = 'https://';
  const next = `${value.slice(0, start)}[${inner}](${url})${value.slice(end)}`;
  const urlStart = start + inner.length + 3;
  return { value: next, start: urlStart, end: urlStart + url.length };
}

function toggleLines(value: string, start: number, end: number, prefix: string): FormatResult {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineBreak = value.indexOf('\n', end);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const allPrefixed = lines.every((line) => line.startsWith(prefix) || line.length === 0);
  const nextLines = lines.map((line) => {
    if (line.length === 0) {
      return line;
    }
    return allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`;
  });
  const nextBlock = nextLines.join('\n');
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
  return { value: next, start: lineStart, end: lineStart + nextBlock.length };
}

function insertBlock(value: string, start: number, end: number, text: string): FormatResult {
  const needsBreak = start > 0 && value[start - 1] !== '\n';
  const block = `${needsBreak ? '\n' : ''}${text}\n`;
  const next = value.slice(0, start) + block + value.slice(end);
  const caret = start + block.length;
  return { value: next, start: caret, end: caret };
}
