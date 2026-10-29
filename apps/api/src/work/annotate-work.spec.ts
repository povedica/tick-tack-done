import { describe, expect, it } from 'vitest';
import { annotateWork, type WorkRow } from './work-context.js';

const row: WorkRow = {
  timeZone: 'Europe/Madrid',
  workDayStart: '09:00',
  workDayEnd: '17:00',
  workDays: [1, 2, 3, 4, 5],
  workFolderIds: ['folder-work'],
  workProjectIds: ['project-work'],
  workTagIds: ['tag-work'],
  hideWorkOutsideHours: false,
  showWorkUntil: null,
};

describe('annotateWork', () => {
  it('uses the folder already loaded with the task', () => {
    expect(
      annotateWork(row, [
        { project_id: 'project-in-folder', tag_ids: [], folder_id: 'folder-work' },
        { project_id: 'project-home', tag_ids: [], folder_id: 'folder-home' },
        { project_id: 'project-work', tag_ids: [], folder_id: null },
        { project_id: 'project-tagged', tag_ids: ['tag-work'], folder_id: null },
      ]),
    ).toEqual([true, false, true, true]);
  });
});
