import { describe, expect, it } from 'vitest';
import { extraEs } from '../../i18n/extra';
import { es } from '../../i18n/es';
import { filterMenuItems } from './filter-menu-items';

describe('filterMenuItems', () => {
  it('keeps the same five actions for every filter menu', () => {
    const labels = filterMenuItems({ ...es, ...extraEs }, false).map((item) => item.label);
    expect(labels).toEqual([
      'Editar condiciones',
      'Editar nombre y color',
      'Fijar arriba',
      'Duplicar',
      'Eliminar',
    ]);
  });
});
