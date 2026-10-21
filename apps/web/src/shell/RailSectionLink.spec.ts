// @vitest-environment jsdom
import { createElement as h } from 'react';
import { CalendarDays, ListTodo, Search } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RailSectionLink } from './RailSectionLink';

afterEach(cleanup);
function mount(path: string) {
  return render(
    h(
      MemoryRouter,
      { initialEntries: [path] },
      h(
        'nav',
        {},
        h(RailSectionLink, { to: '/today', label: 'Tareas', icon: ListTodo, tasks: true }),
        h(RailSectionLink, { to: '/calendar/month', label: 'Calendario', icon: CalendarDays }),
        h(RailSectionLink, { to: '/search', label: 'Buscar', icon: Search }),
      ),
    ),
  );
}
function expectActive(label: string) {
  const links = screen.getAllByRole('link');
  expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  for (const link of links) {
    const active = link.getAttribute('aria-label') === label;
    expect(link.classList.contains('rail-section-inactive')).toBe(!active);
    expect(link.querySelector('svg')?.getAttribute('data-variant')).toBe(
      active ? 'heavy' : 'outline',
    );
    expect(link.querySelector('svg')?.getAttribute('stroke-width')).toBe(active ? '3' : '2');
    expect(link.getAttribute('data-rail-tooltip')).toBe(link.getAttribute('aria-label'));
  }
}
describe('route-driven icon rail', () => {
  it('keeps tasks active on list routes and updates after navigation', () => {
    mount('/list/work?task=one');
    expectActive('Tareas');
    fireEvent.click(screen.getByRole('link', { name: 'Calendario' }));
    expectActive('Calendario');
    fireEvent.click(screen.getByRole('link', { name: 'Buscar' }));
    expectActive('Buscar');
  });
  it('keeps calendar active across views and task details', () => {
    mount('/calendar/week?task=one');
    expectActive('Calendario');
  });
});
