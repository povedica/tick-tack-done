/** Section 12. A manifest is data. The process that runs it is not this package. */

export const PLUGIN_PERMISSIONS = [
  'tasks:read',
  'tasks:write',
  'webhooks:receive',
  'ui:commands',
  'ui:widgets',
  'automations:actions',
  'nlp:patterns',
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly permissions: readonly PluginPermission[];
  readonly entrypoints: Readonly<Record<string, string>>;
  readonly networkAllowlist: readonly string[];
}

export type ManifestFailure = 'invalid' | 'unknown_permission' | 'missing_id';

export type ManifestParse =
  | { readonly ok: true; readonly manifest: PluginManifest }
  | { readonly ok: false; readonly reason: ManifestFailure };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;

export function parsePluginManifest(value: unknown): ManifestParse {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, reason: 'invalid' };
  }
  const body = value as Record<string, unknown>;
  if (typeof body.id !== 'string' || !ID.test(body.id)) {
    return { ok: false, reason: 'missing_id' };
  }
  if (typeof body.version !== 'string' || typeof body.name !== 'string' || body.name.length === 0) {
    return { ok: false, reason: 'invalid' };
  }
  if (!Array.isArray(body.permissions)) {
    return { ok: false, reason: 'invalid' };
  }
  const permissions: PluginPermission[] = [];
  for (const permission of body.permissions) {
    if (!isPermission(permission)) {
      return { ok: false, reason: 'unknown_permission' };
    }
    permissions.push(permission);
  }
  const entrypoints = readStringMap(body.entrypoints);
  const networkAllowlist = Array.isArray(body.networkAllowlist)
    ? body.networkAllowlist.filter((item): item is string => typeof item === 'string')
    : [];
  if (entrypoints === null) {
    return { ok: false, reason: 'invalid' };
  }
  return {
    ok: true,
    manifest: {
      id: body.id,
      version: body.version,
      name: body.name,
      permissions,
      entrypoints,
      networkAllowlist,
    },
  };
}

export function pluginMay(manifest: PluginManifest, permission: PluginPermission): boolean {
  return manifest.permissions.includes(permission);
}

function isPermission(value: unknown): value is PluginPermission {
  return typeof value === 'string' && (PLUGIN_PERMISSIONS as readonly string[]).includes(value);
}

function readStringMap(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      return null;
    }
    out[key] = entry;
  }
  return out;
}
