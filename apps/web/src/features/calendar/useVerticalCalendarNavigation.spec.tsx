// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
import { useVerticalCalendarNavigation } from './useVerticalCalendarNavigation';

function Board({ onMove }: { readonly onMove: (delta: number) => void }) {
  const navigation = useVerticalCalendarNavigation(onMove);
  return <div data-testid="board" {...navigation} />;
}

it('a cancelled touch still moves the period when the swipe already cleared the threshold', () => {
  const onMove = vi.fn();
  const view = render(<Board onMove={onMove} />);
  const board = view.getByTestId('board');
  fireEvent.pointerDown(board, {
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 1,
    clientX: 40,
    clientY: 220,
  });
  fireEvent.pointerCancel(board, {
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 1,
    clientX: 42,
    clientY: 80,
  });
  expect(onMove).toHaveBeenCalledWith(1);
});

it('a short touch does not move the period', () => {
  const onMove = vi.fn();
  const view = render(<Board onMove={onMove} />);
  const board = view.getByTestId('board');
  fireEvent.pointerDown(board, {
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 1,
    clientX: 40,
    clientY: 220,
  });
  fireEvent.pointerUp(board, {
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 1,
    clientX: 44,
    clientY: 190,
  });
  expect(onMove).not.toHaveBeenCalled();
});
