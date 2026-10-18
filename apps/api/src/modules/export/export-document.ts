export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportDocument {
  readonly schema_version: number;
  readonly exported_at: string;
  readonly user: Record<string, unknown>;
  readonly folders: readonly unknown[];
  readonly projects: readonly unknown[];
  readonly tags: readonly unknown[];
  readonly tasks: readonly unknown[];
  readonly habits: readonly unknown[];
  readonly filters: readonly unknown[];
  readonly smart_lists: readonly unknown[];
}

/** RF-1703 / RF-1705. The JSON export is the migration reference and carries schema_version. */
export function buildExportDocument(
  exportedAt: string,
  parts: Omit<ExportDocument, 'schema_version' | 'exported_at'>,
): ExportDocument {
  return { schema_version: EXPORT_SCHEMA_VERSION, exported_at: exportedAt, ...parts };
}
