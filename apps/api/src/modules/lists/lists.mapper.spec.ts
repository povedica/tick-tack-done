import type { Project } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateProjectDto } from './lists.dto.js';
import {
  closureAssignment,
  normalizeOutcome,
  projectState,
  projectStatusAssignment,
  toProjectJson,
} from './lists.mapper.js';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    name: 'Reforma',
    color: null,
    folderId: null,
    viewMode: 'list',
    kind: 'TASK',
    closed: false,
    closedAt: null,
    isInbox: false,
    isProject: true,
    projectStatus: 'active',
    outcome: 'Cocina lista',
    projectStatusChangedAt: null,
    projectReviewedAt: null,
    defaultReminderTrigger: null,
    sortOrder: 65536n,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-18T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('project state', () => {
  it('derives active, paused and archived from closed plus project_status', () => {
    expect(projectState({ closed: false, projectStatus: 'active' })).toBe('active');
    expect(projectState({ closed: false, projectStatus: 'paused' })).toBe('paused');
    expect(projectState({ closed: true, projectStatus: 'paused' })).toBe('archived');
    expect(projectState({ closed: true, projectStatus: 'active' })).toBe('archived');
  });

  it('exposes closed_at and keeps a paused status visible only through state', () => {
    const closedAt = new Date('2026-10-18T10:00:00.000Z');
    const json = toProjectJson(project({ closed: true, closedAt, projectStatus: 'paused' }), 3);
    expect(json.closed_at).toBe('2026-10-18T10:00:00.000Z');
    expect(json.state).toBe('archived');
    expect(json.project_status).toBe('paused');
    expect(json.outcome).toBe('Cocina lista');
    expect(json.project_reviewed_at).toBeNull();
    expect(json.active_task_count).toBe(3);
  });

  it('normalizes outcome by trimming and turning a blank string into null', () => {
    expect(normalizeOutcome(undefined)).toBeUndefined();
    expect(normalizeOutcome(null)).toBeNull();
    expect(normalizeOutcome('  cocina  ')).toBe('cocina');
    expect(normalizeOutcome('   ')).toBeNull();
  });

  it('moves projectStatusChangedAt only when the status changes', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    expect(projectStatusAssignment('active', 'active', now)).toEqual({});
    expect(projectStatusAssignment('paused', undefined, now)).toEqual({});
    expect(projectStatusAssignment('active', 'paused', now)).toEqual({
      projectStatus: 'paused',
      projectStatusChangedAt: now,
    });
  });

  it('rejects an outcome of 201 characters before it is stored', async () => {
    const dto = plainToInstance(CreateProjectDto, { name: 'largo', outcome: 'x'.repeat(201) });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'outcome')).toBe(true);
  });

  it('setClosed fills closedAt when archiving and clears it when unarchiving', () => {
    const now = new Date('2026-10-18T10:00:00.000Z');
    expect(closureAssignment(true, now)).toEqual({ closed: true, closedAt: now });
    expect(closureAssignment(false, now)).toEqual({ closed: false, closedAt: null });
  });
});
