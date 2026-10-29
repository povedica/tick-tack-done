// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Type } from 'lucide-react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldPicker } from './FieldPicker';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener(): void {
      return undefined;
    },
    removeEventListener(): void {
      return undefined;
    },
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness() {
  const [value, setValue] = useState('keyword');
  const [open, setOpen] = useState(false);
  const label = value === 'list' ? 'Campo: Lista' : 'Campo: Palabra';
  return (
    <FieldPicker
      label={label}
      sheetTitle="Campo"
      value={value}
      open={open}
      options={[
        { value: 'keyword', label: 'Palabra', icon: Type },
        { value: 'list', label: 'Lista', icon: Type },
      ]}
      onOpen={() => {
        setOpen(true);
      }}
      onClose={() => {
        setOpen(false);
      }}
      onChange={setValue}
    />
  );
}

describe('FieldPicker', () => {
  it('chooses a field and returns focus on Escape', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Campo: Palabra' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Lista' }));
    expect(screen.getByRole('button', { name: 'Campo: Lista' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Campo: Lista' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('option', { name: 'Lista' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Campo: Lista' }));
  });
});
