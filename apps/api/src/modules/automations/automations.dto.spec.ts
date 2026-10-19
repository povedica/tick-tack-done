import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AutomationDto } from './automations.controller.js';

describe('AutomationDto', () => {
  it('keeps the trigger object the settings form sends', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const body = await pipe.transform(
      {
        name: 'Aviso al completar',
        trigger: { event: 'task.completed@v1' },
        actions: [{ type: 'notify' }],
        enabled: true,
      },
      { type: 'body', metatype: AutomationDto },
    );
    expect(body).toMatchObject({
      name: 'Aviso al completar',
      trigger: { event: 'task.completed@v1' },
      actions: [{ type: 'notify' }],
      enabled: true,
    });
  });
});
