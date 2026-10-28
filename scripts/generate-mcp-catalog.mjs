import { readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';

const root = new URL('../', import.meta.url);
const spec = JSON.parse(await readFile(new URL('apps/api/openapi.json', root), 'utf8'));
function resolve(value, seen = []) {
  if (Array.isArray(value)) return value.map((item) => resolve(item, seen));
  if (value === null || typeof value !== 'object') return value;
  if (value.$ref) {
    const name = value.$ref.split('/').at(-1);
    if (seen.includes(name)) return value;
    return resolve(spec.components.schemas[name], [...seen, name]);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, seen)]));
}
const operations = Object.entries(spec.paths).flatMap(([path, methods]) => {
  if (!path.startsWith('/api/v1/') || path === '/api/v1/mcp' || path.startsWith('/api/v1/mcp/'))
    return [];
  return Object.entries(methods)
    .filter(([method]) => agentVisible(path, method))
    .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
    .map(([method, operation]) => ({
      method: method.toUpperCase(),
      path,
      summary: operation.summary ?? '',
      parameters: resolve(operation.parameters ?? []),
      request_body: resolve(operation.requestBody ?? {}),
    }));
});
function agentVisible(path, method) {
  if (!path.startsWith('/api/v1/auth/')) return true;
  return path === '/api/v1/auth/session' && method === 'get';
}

await writeFile(
  new URL('apps/api/src/mcp/api-operations.json', root),
  await format(JSON.stringify(operations), {
    ...(await resolveConfig(new URL('apps/api/src/mcp/api-operations.json', root).pathname)),
    parser: 'json',
  }),
);
