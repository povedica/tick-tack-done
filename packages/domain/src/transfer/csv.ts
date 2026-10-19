import { isPriority, priorityFromTickTick, type TickTickPriority } from '../priority/priority';
import type { Priority } from '../types';

/** RF-1702. Generic CSV with an explicit column map. */
export interface CsvColumnMap {
  readonly title: string;
  readonly content?: string;
  readonly due?: string;
  readonly priority?: string;
  readonly tags?: string;
  readonly list?: string;
}

export interface CsvTaskDraft {
  readonly title: string;
  readonly content: string;
  readonly dueDate: string | null;
  readonly priority: Priority;
  readonly tags: readonly string[];
  readonly listName: string | null;
}

export type CsvFailure = 'empty' | 'missing_title_column' | 'empty_title';

export type CsvParse =
  | { readonly ok: true; readonly tasks: readonly CsvTaskDraft[] }
  | { readonly ok: false; readonly reason: CsvFailure; readonly row?: number };

const SPANISH: Readonly<Record<string, Priority>> = {
  ninguna: 'none',
  baja: 'low',
  media: 'medium',
  alta: 'high',
};

export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const text = source.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    const next = text[index + 1] ?? '';
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      cell = '';
      if (row.some((item) => item.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((item) => item.trim().length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}

export function mapCsv(source: string, mapping: CsvColumnMap): CsvParse {
  const table = parseCsv(source);
  const header = table[0];
  if (header === undefined) {
    return { ok: false, reason: 'empty' };
  }
  const titleIndex = header.findIndex((name) => name.trim() === mapping.title);
  if (titleIndex < 0) {
    return { ok: false, reason: 'missing_title_column' };
  }
  const tasks: CsvTaskDraft[] = [];
  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index] ?? [];
    const title = (cells[titleIndex] ?? '').trim();
    if (title.length === 0) {
      return { ok: false, reason: 'empty_title', row: index + 1 };
    }
    tasks.push({
      title: title.slice(0, 500),
      content: read(cells, header, mapping.content),
      dueDate: readDue(read(cells, header, mapping.due)),
      priority: readPriority(read(cells, header, mapping.priority)),
      tags: read(cells, header, mapping.tags)
        .split(/[;|]/)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      listName: blankToNull(read(cells, header, mapping.list)),
    });
  }
  return { ok: true, tasks };
}

export interface CsvExportTask {
  readonly title: string;
  readonly content: string;
  readonly dueDate: string | null;
  readonly priority: Priority;
  readonly tags: readonly string[];
  readonly listName: string;
  readonly status: string;
}

/** RF-1703. One list, or a filter result, as CSV. */
export function tasksToCsv(tasks: readonly CsvExportTask[]): string {
  const lines = ['title,content,due,priority,tags,list,status'];
  for (const task of tasks) {
    lines.push(
      [
        task.title,
        task.content,
        task.dueDate ?? '',
        task.priority,
        task.tags.join(';'),
        task.listName,
        task.status,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

function read(
  cells: readonly string[],
  header: readonly string[],
  column: string | undefined,
): string {
  if (column === undefined) {
    return '';
  }
  const index = header.findIndex((name) => name.trim() === column);
  if (index < 0) {
    return '';
  }
  return (cells[index] ?? '').trim();
}

function readDue(value: string): string | null {
  if (value.length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function readPriority(value: string): Priority {
  const key = value.trim().toLowerCase();
  if (key.length === 0) {
    return 'none';
  }
  if (isPriority(key)) {
    return key;
  }
  const spanish = SPANISH[key];
  if (spanish !== undefined) {
    return spanish;
  }
  if (key === '0' || key === '1' || key === '3' || key === '5') {
    return priorityFromTickTick(Number(key) as TickTickPriority);
  }
  return 'none';
}

function blankToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

function csvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}
