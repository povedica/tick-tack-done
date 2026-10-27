// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLongPress } from './useLongPress';

function Probe({ onFire }: { readonly onFire: () => void }) {
  const press = useLongPress(onFire);
  return createElement('button', { type: 'button', ...press }, 'Fila');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useLongPress', () => {
  it('fires after 500 ms of touch and cancels when the finger moves or lifts', () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    render(createElement(Probe, { onFire }));
    const row = screen.getByRole('button', { name: 'Fila' });
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(499);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledOnce();

    onFire.mockClear();
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 20, clientY: 0 });
    vi.advanceTimersByTime(500);
    expect(onFire).not.toHaveBeenCalled();

    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 0, clientY: 0 });
    fireEvent.pointerUp(row);
    vi.advanceTimersByTime(500);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('opens from the context menu and ignores a mouse press', () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    render(createElement(Probe, { onFire }));
    const row = screen.getByRole('button', { name: 'Fila' });
    fireEvent.pointerDown(row, { pointerType: 'mouse', clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(500);
    expect(onFire).not.toHaveBeenCalled();
    fireEvent.contextMenu(row);
    expect(onFire).toHaveBeenCalledOnce();
  });
});
