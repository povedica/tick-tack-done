const DAYS = [
  { code: 'MO', es: 'L', en: 'M', nameEs: 'lunes', nameEn: 'Monday' },
  { code: 'TU', es: 'M', en: 'T', nameEs: 'martes', nameEn: 'Tuesday' },
  { code: 'WE', es: 'X', en: 'W', nameEs: 'miércoles', nameEn: 'Wednesday' },
  { code: 'TH', es: 'J', en: 'T', nameEs: 'jueves', nameEn: 'Thursday' },
  { code: 'FR', es: 'V', en: 'F', nameEs: 'viernes', nameEn: 'Friday' },
  { code: 'SA', es: 'S', en: 'S', nameEs: 'sábado', nameEn: 'Saturday' },
  { code: 'SU', es: 'D', en: 'S', nameEs: 'domingo', nameEn: 'Sunday' },
] as const;

export type WorkDayCode = (typeof DAYS)[number]['code'];

export function workDays(): readonly (typeof DAYS)[number][] {
  return DAYS;
}

function spanish(locale: string): boolean {
  return !locale.toLowerCase().startsWith('en');
}

export function workCopy(locale: string) {
  if (!spanish(locale)) {
    return {
      title: 'Workday',
      lede: 'Your work hours. ttd uses them to estimate the day’s load and, if you want, to separate work and personal.',
      schedule: 'Schedule',
      hours: 'Hours',
      starts: 'Starts',
      ends: 'Ends',
      days: 'Working days',
      membership: 'Work and personal',
      optional: 'Optional',
      rule: 'A task is work if its folder, its list or one of its tags is here. Everything else is personal.',
      folders: 'Folders',
      lists: 'Lists',
      tags: 'Tags',
      add: 'Add',
      search: 'Search',
      empty: 'Nothing matches',
      hide: 'Hide work outside work hours',
      showWork: 'Show work',
      hideWork: 'Hide work',
      estimates: 'Estimates',
      minutes: 'min',
      daysBefore: 'days before',
      remove: 'Remove',
    };
  }
  return {
    title: 'Jornada',
    lede: 'Tu horario de trabajo. ttd lo usa para estimar la carga del día y, si quieres, para separar trabajo y personal.',
    schedule: 'Horario',
    hours: 'Horas',
    starts: 'Empieza',
    ends: 'Termina',
    days: 'Días laborables',
    membership: 'Trabajo y personal',
    optional: 'Opcional',
    rule: 'Una tarea es laboral si su carpeta, su lista o alguna de sus etiquetas está aquí. Todo lo demás es personal.',
    folders: 'Carpetas',
    lists: 'Listas',
    tags: 'Etiquetas',
    add: 'Añadir',
    search: 'Buscar',
    empty: 'No hay coincidencias',
    hide: 'Ocultar lo laboral fuera de jornada',
    showWork: 'Mostrar trabajo',
    hideWork: 'Ocultar trabajo',
    estimates: 'Estimaciones',
    minutes: 'min',
    daysBefore: 'días antes',
    remove: 'Quitar',
  };
}

export function workHideHelp(
  locale: string,
  start: string | null,
  end: string | null,
  days: readonly string[],
): string {
  const from = start && start.length > 0 ? start : '09:00';
  const to = end && end.length > 0 ? end : '18:00';
  const off = DAYS.filter((day) => !days.includes(day.code)).map((day) =>
    spanish(locale) ? day.nameEs : day.nameEn,
  );
  const listed = joinAnd(off, spanish(locale));
  if (spanish(locale)) {
    const when = listed.length === 0 ? '' : ` y en ${listed}`;
    return `Fuera de ${from}–${to}${when}, Hoy, Próximos, el calendario y los avisos solo muestran lo personal. «Mostrar trabajo» lo enseña un rato. Búsqueda y listas lo muestran siempre.`;
  }
  const when = listed.length === 0 ? '' : ` and on ${listed}`;
  return `Outside ${from}–${to}${when}, Today, Upcoming, the calendar and reminders show only personal tasks. “Show work” reveals them for a while. Search and lists always show them.`;
}

export function workCountLine(locale: string, lists: number, tags: number, tasks: number): string {
  if (spanish(locale)) {
    return `Ahora cuentan como laboral ${String(lists)} ${lists === 1 ? 'lista' : 'listas'} y ${String(tags)} ${tags === 1 ? 'etiqueta' : 'etiquetas'} · ${String(tasks)} ${tasks === 1 ? 'tarea activa' : 'tareas activas'}.`;
  }
  return `${String(lists)} ${lists === 1 ? 'list' : 'lists'} and ${String(tags)} ${tags === 1 ? 'tag' : 'tags'} count as work · ${String(tasks)} active ${tasks === 1 ? 'task' : 'tasks'}.`;
}

export function outsideHoursLine(now: Date, timeZone: string, locale: string): string {
  const lang = spanish(locale) ? 'es' : 'en';
  const clean = (value: string) => value.replace(/\./g, '').toLowerCase();
  const weekday = clean(new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone }).format(now));
  const day = new Intl.DateTimeFormat(lang, { day: 'numeric', timeZone }).format(now);
  const month = clean(new Intl.DateTimeFormat(lang, { month: 'short', timeZone }).format(now));
  const time = new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(now);
  const tail = lang === 'es' ? 'fuera de jornada' : 'outside work hours';
  return `${weekday} ${day} ${month} · ${time} · ${tail}`;
}

function joinAnd(names: readonly string[], isSpanish: boolean): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  const and = isSpanish ? 'y' : 'and';
  const last = names.at(-1) ?? '';
  if (names.length === 2) {
    return `${names[0] ?? ''} ${and} ${last}`;
  }
  return `${names.slice(0, -1).join(', ')} ${and} ${last}`;
}
