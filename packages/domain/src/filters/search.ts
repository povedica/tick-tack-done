import type { Priority } from '../types';

export interface ParsedSearch {
  readonly text: string;
  readonly listName: string | null;
  readonly tagNames: readonly string[];
  readonly priority: Priority | null;
  readonly done: boolean | null;
}

/** RF-1501. Inline tokens: in:list, in:"list name", #tag, priority:high, done:true. */
export function parseSearchQuery(query: string): ParsedSearch {
  const text: string[] = [];
  let listName: string | null = null;
  const tagNames: string[] = [];
  let priority: Priority | null = null;
  let done: boolean | null = null;
  for (const token of tokensOf(query)) {
    const list = listToken(token);
    if (list !== null) {
      if (list.length > 0) {
        listName = list;
      }
      continue;
    }
    if (token.startsWith('#')) {
      const name = token.slice(1).trim();
      if (name.length > 0) {
        tagNames.push(name);
      }
      continue;
    }
    const level = priorityToken(token);
    if (level !== undefined) {
      priority = level;
      continue;
    }
    const completed = doneToken(token);
    if (completed !== undefined) {
      done = completed;
      continue;
    }
    text.push(token);
  }
  return { text: text.join(' ').trim(), listName, tagNames, priority, done };
}

function tokensOf(query: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < query.length) {
    while (isSpace(query[index])) {
      index += 1;
    }
    if (index >= query.length) {
      break;
    }
    const quoted = quotedList(query, index);
    if (quoted !== null) {
      tokens.push(quoted.token);
      index = quoted.next;
      continue;
    }
    const rest = query.slice(index);
    const space = rest.search(/\s/u);
    if (space === -1) {
      tokens.push(rest);
      break;
    }
    tokens.push(rest.slice(0, space));
    index += space;
  }
  return tokens;
}

function quotedList(query: string, index: number): { token: string; next: number } | null {
  if (!query.slice(index).toLowerCase().startsWith('in:"')) {
    return null;
  }
  const end = query.indexOf('"', index + 4);
  if (end === -1) {
    return null;
  }
  return { token: query.slice(index, end + 1), next: end + 1 };
}

function listToken(token: string): string | null {
  const lower = token.toLowerCase();
  if (lower.startsWith('in:"')) {
    if (!token.endsWith('"') || token.length <= 4) {
      return null;
    }
    return token.slice(4, -1).trim();
  }
  if (lower.startsWith('in:')) {
    return token.slice(3).trim();
  }
  return null;
}

function priorityToken(token: string): Priority | undefined {
  const lower = token.toLowerCase();
  if (!lower.startsWith('priority:')) {
    return undefined;
  }
  const value = lower.slice('priority:'.length);
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'none') {
    return value;
  }
  return undefined;
}

function doneToken(token: string): boolean | undefined {
  const lower = token.toLowerCase();
  if (!lower.startsWith('done:')) {
    return undefined;
  }
  if (lower === 'done:true') {
    return true;
  }
  if (lower === 'done:false') {
    return false;
  }
  return undefined;
}

function isSpace(value: string | undefined): boolean {
  return value === ' ' || value === '\n' || value === '\t';
}
