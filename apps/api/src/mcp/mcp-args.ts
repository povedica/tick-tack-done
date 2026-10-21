/**
 * TTD-AUD-54: validate MCP tool arguments against the published JSON Schema
 * (additionalProperties: false) before running the tool.
 */

export type McpArgsValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly unknown[];
  readonly items?: JsonSchema;
  readonly format?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly pattern?: string;
  readonly description?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateMcpArgs(
  schema: unknown,
  args: Record<string, unknown>,
): McpArgsValidation {
  const errors: string[] = [];
  validateNode(schema as JsonSchema, args, '', errors);
  if (errors.length === 0) {
    return { ok: true };
  }
  return { ok: false, message: errors.join('; ') };
}

function validateNode(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (schema.type !== undefined) {
    const types: readonly string[] = Array.isArray(schema.type)
      ? schema.type
      : [schema.type];
    if (!types.some((type) => matchesType(type, value))) {
      errors.push(`${label(path)} must be ${types.join(' | ')}`);
      return;
    }
  }
  if (value === null) {
    return;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${label(path)} must be one of: ${schema.enum.join(', ')}`);
    return;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${label(path)} is too short`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${label(path)} is too long`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${label(path)} has an invalid format`);
    }
    if (schema.format === 'uuid' && !UUID_RE.test(value)) {
      errors.push(`${label(path)} must be a uuid`);
    }
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      errors.push(`${label(path)} must be a date-time`);
    }
  }
  if (typeof value === 'number') {
    if (schema.type === 'integer' || (Array.isArray(schema.type) && schema.type.includes('integer'))) {
      if (!Number.isInteger(value)) {
        errors.push(`${label(path)} must be an integer`);
      }
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${label(path)} is below minimum ${String(schema.minimum)}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${label(path)} is above maximum ${String(schema.maximum)}`);
    }
  }
  const itemsSchema = schema.items;
  if (Array.isArray(value) && itemsSchema !== undefined) {
    value.forEach((item, index) => {
      validateNode(itemsSchema, item, `${path}[${String(index)}]`, errors);
    });
  }
  if (isRecord(value) && schema.properties !== undefined) {
    const allowed = new Set(Object.keys(schema.properties));
    const unknown = Object.keys(value).filter((key) => !allowed.has(key));
    if (schema.additionalProperties === false && unknown.length > 0) {
      errors.push(
        `Campos no admitidos: ${unknown.join(', ')}. Campos válidos: ${[...allowed].join(', ') || '(ninguno)'}`,
      );
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        errors.push(`${label(path ? `${path}.${key}` : key)} is required`);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties[key];
      if (childSchema === undefined) {
        continue;
      }
      validateNode(childSchema, child, path ? `${path}.${key}` : key, errors);
    }
  }
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function label(path: string): string {
  return path.length === 0 ? 'arguments' : path;
}
