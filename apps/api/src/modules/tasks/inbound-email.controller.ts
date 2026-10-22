import { Controller, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../auth/scopes.decorator.js';
import { applyRateLimitHeaders } from '../../auth/token-rate-limit.js';
import { DomainException } from '../../http/domain.exception.js';
import { InboundRateLimiter } from '../../inbound/inbound-rate-limit.js';
import { respondJson } from '../../http/respond.js';
import { multipartStream, multipartFileParts } from '../../http/multipart-stream.js';
import { TasksService } from './tasks.service.js';
@ApiTags('inbound')
@Controller('inbound')
export class InboundEmailController {
  constructor(
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(InboundRateLimiter) private readonly limiter: InboundRateLimiter,
  ) {}
  @Post('email')
  @Public()
  @ApiOperation({
    summary:
      'Create an email-to-task capture (RF-105). Send recipient, subject, text and message_id fields before files. Files stream directly to the owner’s Drive (25 MiB each, 10 files); without Drive the task is saved with an attachment warning.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['recipient', 'subject'],
      properties: {
        recipient: { type: 'string' },
        subject: { type: 'string' },
        text: { type: 'string' },
        message_id: { type: 'string' },
        file: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  async receive(@Req() req: Request, @Res() res: Response): Promise<void> {
    const decision = this.limiter.consume(req.ip ?? 'unknown');
    applyRateLimitHeaders(res, decision);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfter));
      throw new DomainException(429, 'rate_limited', 'Too many requests', {
        retry_after: decision.retryAfter,
      });
    }
    let taskPromise: ReturnType<TasksService['acceptInboundEmail']> | null = null;
    const ensure = (fields: ReadonlyMap<string, string>) => {
      if (!fields.has('recipient') || !fields.has('subject'))
        throw new DomainException(
          400,
          'validation_failed',
          'recipient and subject must precede files',
        );
      taskPromise ??= this.tasks.acceptInboundEmail({
        recipient: fields.get('recipient'),
        subject: fields.get('subject'),
        text: fields.get('text'),
        messageId: fields.get('message_id'),
      });
      return taskPromise;
    };
    const warnings: { code: string; message: string }[] = [];
    const parsed = await multipartStream(
      req,
      async (file, info, fields) => {
        const capture = await ensure(fields);
        if (!capture.fresh) {
          file.resume();
          return null;
        }
        const task = capture.task;
        const user = await this.tasks.inboundUser(fields.get('recipient') ?? '');
        try {
          return await this.tasks.streamAttachment(
            user,
            task.id,
            info.filename,
            multipartFileParts(file),
            'email',
          );
        } catch (error) {
          const code =
            error instanceof DomainException
              ? (error.getResponse() as { code?: string }).code
              : null;
          if (code !== 'drive_not_connected' && code !== 'drive_reauth_required') throw error;
          file.resume();
          warnings.push({
            code,
            message: 'No he guardado el adjunto: conecta Google Drive en Ajustes > Integraciones',
          });
          return null;
        }
      },
      10,
    );
    const task = (await ensure(parsed.fields)).task;
    respondJson(
      req,
      res,
      HttpStatus.CREATED,
      {
        ...task,
        ...(warnings.length ? { warnings: [...(task.warnings ?? []), ...warnings] } : {}),
      },
      false,
    );
  }
}
