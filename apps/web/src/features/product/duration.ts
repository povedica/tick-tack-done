/** Turns a length into hours and minutes. 7932 seconds (shown before as 132:09) becomes "2 h 12 min". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  return formatDurationMinutes(Math.floor(seconds / 60));
}

/** Human duration from whole minutes (TSK-3: 8820 → "6 d 3 h"). */
export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest > 0 ? `${String(hours)} h ${String(rest)} min` : `${String(hours)} h`;
  }
  const days = Math.floor(hours / 24);
  const left = hours % 24;
  if (left > 0 && rest > 0) {
    return `${String(days)} d ${String(left)} h ${String(rest)} min`;
  }
  if (left > 0) {
    return `${String(days)} d ${String(left)} h`;
  }
  return `${String(days)} d`;
}
