// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Segmented } from './Segmented';

afterEach(() => {
  cleanup();
});

function Harness() {
  const [value, setValue] = useState('all');
  return (
    <Segmented
      label="Coincidencia"
      value={value}
      options={[
        { value: 'all', label: 'Todas' },
        { value: 'any', label: 'Alguna' },
      ]}
      onChange={setValue}
    />
  );
}

describe('Segmented', () => {
  it('moves the check with the arrow keys and keeps one tab stop', () => {
    render(<Harness />);
    const all = screen.getByRole('radio', { name: 'Todas' });
    const any = screen.getByRole('radio', { name: 'Alguna' });
    expect(all.getAttribute('aria-checked')).toBe('true');
    expect(all.tabIndex).toBe(0);
    expect(any.tabIndex).toBe(-1);
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(any.getAttribute('aria-checked')).toBe('true');
    expect(any.tabIndex).toBe(0);
    expect(all.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(any);
  });
});
