import type { ChecklistStatus } from '../types';

const CHECKBOX_LINE = /^[ \t]*[-*][ \t]+\[([ xX])\][ \t]+(.*)$/;

export interface ExtractedChecklistItem {
  readonly title: string;
  readonly status: ChecklistStatus;
}

export interface ExtractedChecklist {
  readonly content: string;
  readonly items: readonly ExtractedChecklistItem[];
}

/** RF-202: Markdown checkbox lines become checklist items. Other lines stay. */
export function extractMarkdownChecklist(content: string): ExtractedChecklist {
  const items: ExtractedChecklistItem[] = [];
  const kept: string[] = [];
  for (const line of content.split('\n')) {
    const match = CHECKBOX_LINE.exec(line);
    const mark = match?.[1];
    const rawTitle = match?.[2];
    if (mark === undefined || rawTitle === undefined) {
      kept.push(line);
      continue;
    }
    const title = rawTitle.trim();
    if (title.length === 0) {
      continue;
    }
    items.push({ title, status: mark === ' ' ? 'active' : 'completed' });
  }
  const collapsed = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { content: collapsed, items };
}
