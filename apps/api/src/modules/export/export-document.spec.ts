import { describe, expect, it } from 'vitest';
import { buildExportDocument, EXPORT_SCHEMA_VERSION } from './export-document.js';

describe('export document', () => {
  it('RF-1705: the JSON export carries schema_version', () => {
    const document = buildExportDocument('2026-10-18T12:00:00.000Z', {
      user: { id: 'u' },
      folders: [],
      projects: [],
      tags: [],
      tasks: [],
      habits: [],
      filters: [],
      smart_lists: [],
    });
    expect(document.schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(document.exported_at).toBe('2026-10-18T12:00:00.000Z');
  });
});
