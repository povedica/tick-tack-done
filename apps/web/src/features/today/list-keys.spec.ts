import { describe, expect, it } from 'vitest';
import { completeLeaveMs } from './completion';
import { listCommand } from './list-keys';

describe('today list keys', () => {
  it('maps list shortcuts and ignores modified keys', () => {
    expect(listCommand({ key: 'ArrowDown', metaKey: false, ctrlKey: false, altKey: false })).toBe(
      'down',
    );
    expect(listCommand({ key: ' ', metaKey: false, ctrlKey: false, altKey: false })).toBe(
      'complete',
    );
    expect(listCommand({ key: 'x', metaKey: true, ctrlKey: false, altKey: false })).toBeNull();
    expect(completeLeaveMs(true)).toBe(0);
    expect(completeLeaveMs(false)).toBe(250);
  });
});
