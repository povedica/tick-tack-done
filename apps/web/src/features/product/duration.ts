/** Turns a length into hours and minutes. 7932 seconds (shown before as 132:09) becomes "2 h 12 min". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const left = hours % 24;
    return left > 0 ? `${String(days)} d ${String(left)} h` : `${String(days)} d`;
  }
  if (hours > 0) {
    return rest > 0 ? `${String(hours)} h ${String(rest)} min` : `${String(hours)} h`;
  }
  return `${String(rest)} min`;
}
