import { describe, expect, it } from 'vitest';
import { comparePriority, isPriority, priorityFromTickTick, priorityToTickTick } from './priority';

describe('priority', () => {
  it('RF-501: recognizes the four priority names', () => {
    expect(['none', 'low', 'medium', 'high'].every((value) => isPriority(value))).toBe(true);
    expect(isPriority('urgent')).toBe(false);
  });

  it('RF-501: high sorts ahead of medium, low and none', () => {
    expect(comparePriority('high', 'medium')).toBeLessThan(0);
    expect(comparePriority('medium', 'low')).toBeLessThan(0);
    expect(comparePriority('low', 'none')).toBeLessThan(0);
    expect(comparePriority('none', 'none')).toBe(0);
  });

  it('RF-503: maps none/low/medium/high to TickTick 0/1/3/5 and back', () => {
    expect(priorityToTickTick('none')).toBe(0);
    expect(priorityToTickTick('low')).toBe(1);
    expect(priorityToTickTick('medium')).toBe(3);
    expect(priorityToTickTick('high')).toBe(5);
    expect(priorityFromTickTick(0)).toBe('none');
    expect(priorityFromTickTick(1)).toBe('low');
    expect(priorityFromTickTick(3)).toBe('medium');
    expect(priorityFromTickTick(5)).toBe('high');
  });

  it('RF-503: rejects TickTick priorities outside 0/1/3/5', () => {
    expect(() => priorityFromTickTick(2)).toThrow(/unsupported TickTick priority/);
    expect(() => priorityFromTickTick(4)).toThrow(/unsupported TickTick priority/);
  });
});
