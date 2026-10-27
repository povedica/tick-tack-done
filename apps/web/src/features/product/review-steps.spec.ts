import { describe, expect, it } from 'vitest';
import { reviewStepIndex, reviewSteps } from './review-steps';

describe('weekly review steps', () => {
  it('puts Proyectos between Sin fecha and Preparar la semana', () => {
    expect(reviewSteps('granted')).toEqual(['inbox', 'overdue', 'undated', 'projects', 'prepare']);
    expect(reviewStepIndex('undated', 'granted')).toBe(2);
    expect(reviewStepIndex('projects', 'granted')).toBe(3);
    expect(reviewStepIndex('prepare', 'granted')).toBe(4);
    expect(reviewStepIndex('prepare', 'granted')).not.toBe(3);
  });

  it('hides the projects step when the token cannot read lists', () => {
    expect(reviewSteps('missing')).toEqual(['inbox', 'overdue', 'undated', 'prepare']);
    expect(reviewStepIndex('projects', 'missing')).toBe(-1);
    expect(reviewStepIndex('prepare', 'missing')).toBe(3);
  });
});
