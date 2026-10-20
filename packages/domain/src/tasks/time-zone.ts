// Intl validation is deterministic and expensive; bound the cache for untrusted zone inputs.
const zoneCache = new Map<string, boolean>();
export function isIanaTimeZone(timeZone: string): boolean {
  const cached = zoneCache.get(timeZone);
  if (cached !== undefined) return cached;
  if (zoneCache.size >= 256) zoneCache.clear();
  if (timeZone.length === 0) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    zoneCache.set(timeZone, true);
    return true;
  } catch {
    zoneCache.set(timeZone, false);
    return false;
  }
}
