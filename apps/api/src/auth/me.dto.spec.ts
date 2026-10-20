import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateMeDto } from './me.dto.js';

describe('account navigation order validation', () => {
  it('accepts partial module orders and rejects unknown or duplicate entries', async () => {
    const valid = plainToInstance(UpdateMeDto, {
      features: { navigation_order: ['statistics', 'dashboard'] },
    });
    expect(await validate(valid)).toEqual([]);
    for (const navigation_order of [['calendar', 'calendar'], ['unknown'], 'calendar']) {
      expect(
        await validate(plainToInstance(UpdateMeDto, { features: { navigation_order } })),
      ).not.toEqual([]);
    }
  });
});
