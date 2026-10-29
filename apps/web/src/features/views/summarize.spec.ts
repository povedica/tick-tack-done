import { describe, expect, it } from 'vitest';
import { summarizeRules, type SummaryText } from './summarize';

const text: SummaryText = {
  today: 'Hoy',
  tomorrow: 'Mañana',
  next7: 'Próximos 7 días',
  overdue: 'Vencidas',
  noDate: 'Sin fecha',
  between: 'Entre fechas',
  priorityHigh: 'Alta',
  priorityMedium: 'Media o más',
  priorityLow: 'Baja o más',
  priorityAny: 'Cualquiera',
  statusActive: 'Pendiente',
  statusCompleted: 'Completada',
  deletedTag: 'Etiqueta eliminada',
  deletedFolder: 'Carpeta eliminada',
};

describe('summarizeRules', () => {
  it('names a tag from the label map and marks a deleted one', () => {
    const chips = summarizeRules(
      {
        combinator: 'AND',
        groups: [
          {
            combinator: 'AND',
            conditions: [
              { field: 'tag', op: 'any_of', value: ['casa', 'gone'] },
              { field: 'date', op: 'today' },
              { field: 'priority', op: 'gte', value: 'high' },
              { field: 'keyword', op: 'contains', value: 'informe' },
            ],
          },
        ],
      },
      {
        tagLabels: {
          casa: { name: 'casa', color: '#1F9D55', deleted: false },
          gone: { name: 'vieja', color: null, deleted: true },
        },
        listNames: new Map(),
        text,
      },
    );
    expect(chips.map((chip) => chip.text)).toEqual([
      'casa',
      'Etiqueta eliminada',
      'Hoy',
      'Alta',
      'informe',
    ]);
    expect(chips.map((chip) => chip.icon)).toEqual(['tag', 'tag', 'calendar', 'flag', 'type']);
  });
});
