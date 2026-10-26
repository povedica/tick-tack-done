import type { Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
import type { PlanCard, Choice, PlanSession } from '../src/features/planning/api';
export async function wtFFixture(
  page: Page,
  options: {
    empty?: boolean;
    error?: boolean;
    delay?: number;
    conflict?: boolean;
    reviewed?: boolean;
    zeroRecurring?: boolean;
  } = {},
) {
  await r80Fixture(page);
  await page.clock.setFixedTime(new Date('2026-10-26T08:00:00Z'));
  const titles = [
    'Revisar contrato del alquiler de la casa de Cadaqués antes de firmar',
    'Revisión semanal y plan de la semana',
    'Pedir cita previa para renovar el DNI',
    'Ordenar las fotos del viaje a Londres',
    'Llamar a la gestoría por el IVA',
    'Reservar excursión para el sábado',
    'Preparar propuesta de colaboración',
    'Pedir revisión de la moto',
    'Revisar factura del proveedor',
    'Repasar la planificación',
    'Configurar alertas en Grafana',
    'Pintar el cuarto de Lucía',
  ];
  const cards: PlanCard[] = options.empty
    ? []
    : titles.map((title, i) => ({
        task_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        title,
        content:
          i === 0
            ? 'El propietario (**@Jordi Puig**) pide respuesta esta semana. Puntos a revisar con calma:\n\n1. **Fianza**: piden 2 mensualidades; en 2026 fue 1. ¿Negociable?\n2. Cláusula 7: penalización por cancelación del 50 % si es con menos de 60 días.\n3. Inventario: falta la cuna de viaje que pedimos para Lucía.\n4. Fechas: del **2 al 16 de agosto de 2027**, entrada a partir de las 16:00.\n\nComentarios de Ana en el hilo: [correo del 21 oct](https://mail.example.com/t/cadaques). Si todo cuadra, firmar con Autofirma y reenviar a Jordi.'
            : 'Revisión sintética para verificar el plan. **Sin datos reales.**',
        priority: i === 0 ? 'medium' : 'none',
        project_name: i === 0 ? 'Casa' : 'Personal',
        project_color: 'var(--accent)',
        due_date: '2026-10-23T12:00Z',
        start_date: null,
        duration_minutes: options.zeroRecurring && i === 1 ? 0 : null,
        is_all_day: true,
        recurring: i === 1,
        repeat_rule: i === 1 ? 'Cada domingo' : null,
        tags:
          i === 0
            ? [
                { id: 'tag1', name: 'vacaciones', color: null },
                { id: 'tag2', name: 'contratos', color: null },
              ]
            : [],
        attachments:
          i === 0
            ? [
                {
                  id: 'file1',
                  name: 'contrato-cadaques-2027.pdf',
                  url: 'https://example.test/contract',
                },
                { id: 'file2', name: 'anexo-inventario.pdf', url: 'https://example.test/annex' },
              ]
            : [],
      }));
  if (options.reviewed) {
    const ordered = [2, 3, 4, 0, 1, 5, 6, 7, 8, 9, 10, 11].flatMap((index) =>
      cards[index] ? [cards[index]] : [],
    );
    cards.splice(0, cards.length, ...ordered);
  }
  const seeded: Choice[] =
    options.reviewed && cards[0] && cards[1] && cards[2]
      ? [
          { task_id: cards[0].task_id, action: 'today', time: '11:00', duration: 30 },
          { task_id: cards[1].task_id, action: 'move', date: '2026-10-30' },
          { task_id: cards[2].task_id, action: 'today' },
        ]
      : [];
  let decisions: Choice[] = seeded,
    revision = 1;
  const counts = { sessions: 0, applied: 0, reverted: 0, scheduled: 0 };
  let committed: string[] = [];
  const scheduled = new Map<string, string>();
  const session = (): PlanSession => ({
    id: '10000000-0000-4000-8000-000000000001',
    revision,
    local_date: '2026-10-26',
    time_zone: 'Europe/Madrid',
    cards,
    decisions,
    committed_task_ids: committed,
  });
  await page.route('**/api/v1/planning/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
    if (options.error) {
      await route.fulfill({ status: 500, json: { error: { code: 'synthetic_error' } } });
      return;
    }
    if (path.endsWith('/load')) {
      const days = Array.from({ length: 14 }, (_, i) => {
        const date = new Date(Date.UTC(2026, 9, 26 + i)).toISOString().slice(0, 10);
        return {
          date,
          task_minutes: 0,
          event_minutes: i ? 30 : 165,
          available_minutes: [5, 6].includes(i % 7) ? null : 540,
          ratio: 0.3,
          status: 'ok',
          tasks: [],
          events: [
            {
              id: 'daily',
              title: 'Daily del equipo',
              starts_at: `${date}T08:00:00Z`,
              ends_at: `${date}T08:30:00Z`,
              is_all_day: false,
            },
            ...(i
              ? []
              : [
                  {
                    id: 'sprint',
                    title: 'Revisión del sprint',
                    starts_at: `${date}T09:00:00Z`,
                    ends_at: `${date}T10:00:00Z`,
                    is_all_day: false,
                  },
                  {
                    id: 'meal',
                    title: 'Comida',
                    starts_at: `${date}T12:30:00Z`,
                    ends_at: `${date}T13:30:00Z`,
                    is_all_day: false,
                  },
                ]),
          ],
        };
      });
      await route.fulfill({
        json: {
          time_zone: 'Europe/Madrid',
          settings: {
            work_day_start: '09:00',
            work_day_end: '18:00',
            evening_start: '18:00',
            default_task_duration: 30,
            work_days: [1, 2, 3, 4, 5],
          },
          days,
        },
      });
      return;
    }
    if (path.endsWith('/candidates')) {
      await route.fulfill({ json: { count: cards.length } });
      return;
    }
    if (path.endsWith('/sessions')) counts.sessions++;
    if (path.includes('/decisions/')) {
      const task_id = path.split('/').at(-1)!;
      decisions = decisions.filter((d) => d.task_id !== task_id);
      if (route.request().method() !== 'DELETE')
        decisions.push({ ...(route.request().postDataJSON() as Choice), task_id });
      revision++;
    }
    if (path.includes('/schedule/')) {
      const task_id = path.split('/').at(-1)!;
      decisions = [
        ...decisions.filter((d) => d.task_id !== task_id),
        { ...(route.request().postDataJSON() as Choice), task_id },
      ];
      revision++;
      counts.scheduled++;
      committed.push(task_id);
      const operation_id = `20000000-0000-4000-8000-${String(counts.scheduled).padStart(12, '0')}`;
      scheduled.set(operation_id, task_id);
      await route.fulfill({ json: { ...session(), operation_id } });
      return;
    }
    if (path.endsWith('/apply')) {
      if (options.conflict) {
        await route.fulfill({
          status: 409,
          json: { error: { code: 'plan_conflict', details: { task_ids: [cards[0]?.task_id] } } },
        });
        return;
      }
      counts.applied++;
      await route.fulfill({
        json: { operation_id: '20000000-0000-4000-8000-000000000001', applied: decisions },
      });
      return;
    }
    if (path.endsWith('/revert')) {
      counts.reverted++;
      const operation = path.split('/').at(-2)!;
      const task = scheduled.get(operation);
      if (task) {
        committed = committed.filter((id) => id !== task);
        decisions = decisions.filter((d) => d.task_id !== task);
      }
      await route.fulfill({ json: { reverted: true } });
      return;
    }
    await route.fulfill({ json: session() });
  });
  return {
    counts,
    get decisions() {
      return decisions;
    },
    cards,
  };
}
