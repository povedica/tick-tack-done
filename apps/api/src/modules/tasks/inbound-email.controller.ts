import {
  Body,
  Controller,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { applyRateLimitHeaders } from '../../auth/token-rate-limit';
import { DomainException } from '../../http/domain.exception';
import { InboundRateLimiter } from '../../inbound/inbound-rate-limit';
import { respondJson } from '../../http/respond';
import { ATTACHMENT_MAX_BYTES } from './attachment-storage';
import { TasksService } from './tasks.service';

@ApiTags('inbound')
@Controller('inbound')
export class InboundEmailController {
  constructor(
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(InboundRateLimiter) private readonly limiter: InboundRateLimiter,
  ) {}

  @Post('email')
  @ApiOperation({
    summary:
      'Deliver an email-to-task message (RF-105). The recipient token authenticates the call. Content is stored and never executed.',
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
  @UseInterceptors(
    FilesInterceptor('file', 10, {
      storage: memoryStorage(),
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 10 },
    }),
  )
  async receive(
    @Body('recipient') recipient: unknown,
    @Body('subject') subject: unknown,
    @Body('text') text: unknown,
    @Body('message_id') messageId: unknown,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const decision = this.limiter.consume(req.ip ?? 'unknown');
    applyRateLimitHeaders(res, decision);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfter));
      throw new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        retry_after: decision.retryAfter,
      });
    }
    const declared = Number(req.header('content-length') ?? 0);
    const total = (files ?? []).reduce((sum, file) => sum + file.size, 0);
    if (
      (Number.isFinite(declared) && declared > ATTACHMENT_MAX_BYTES) ||
      total > ATTACHMENT_MAX_BYTES
    ) {
      throw new DomainException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'payload_too_large',
        'Email payload exceeds 25 MB',
      );
    }
    const task = await this.tasks.acceptInboundEmail({
      recipient,
      subject,
      text,
      messageId,
      files: files ?? [],
    });
    respondJson(req, res, HttpStatus.CREATED, task, false);
  }
}
