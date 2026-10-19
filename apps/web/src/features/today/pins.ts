export const PIN_KEY = 'tick-tack-done.tasks.pinned';

export function readPins(raw: string | null): string[] {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function togglePin(pins: readonly string[], id: string): string[] {
  return pins.includes(id) ? pins.filter((item) => item !== id) : [...pins, id];
}
