import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  type OnModuleInit,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { webhookRetryDelayMs, webhookStillOpen } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import type { DomainBusEvent } from '../../events/event-bus.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { EventRouter } from '../../events/event-router.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { openField, sealField } from '../../security/field-cipher.js';
import { assertPublicUrl, safeFetch } from '../../security/safe-fetch.js';

class WebhookDto {
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  url!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  secret?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  events!: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class WebhookPatchDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Injectable()
export class WebhookDispatcher implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRouter) private readonly router: EventRouter,
  ) {}

  onModuleInit(): void {
    this.router.subscribe((event) => this.fanOut(event));
  }

  /** One bus event, one row per endpoint. A slow URL does not block the others. */
  async fanOut(event: DomainBusEvent): Promise<void> {
    if (event.ownerId.length === 0) {
      return;
    }
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { ownerId: event.ownerId, deletedAt: null, active: true },
    });
    await Promise.all(
      endpoints
        .filter((endpoint) => endpoint.events.length === 0 || endpoint.events.includes(event.type))
        .map((endpoint) => this.enqueue(endpoint.id, event)),
    );
  }

  async enqueue(endpointId: string, event: DomainBusEvent): Promise<void> {
    await this.prisma.webhookDelivery.upsert({
      where: { endpointId_eventId: { endpointId, eventId: event.id } },
      create: {
        endpointId,
        eventId: event.id,
        eventType: event.type,
        state: 'pending',
        nextAttempt: new Date(),
      },
      update: {},
    });
  }

  async deliverOne(id: string, ownerId: string): Promise<{ state: string; status: number | null }> {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id, endpoint: { ownerId } },
      include: { endpoint: true },
    });
    if (delivery === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'delivery_not_found',
        'Delivery was not found',
      );
    }
    const payload = JSON.stringify({ id: delivery.eventId, type: delivery.eventType });
    const signature = createHmac('sha256', openField(delivery.endpoint.secret))
      .update(payload)
      .digest('hex');
    let status: number | null = null;
    let ok = false;
    try {
      const response = await safeFetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Signature-256': `sha256=${signature}`,
        },
        body: payload,
        maxBytes: 64 * 1024,
      });
      status = response.status;
      ok = response.status >= 200 && response.status < 300;
    } catch {
      ok = false;
    }
    const attempts = delivery.attempts + 1;
    const open = webhookStillOpen(
      delivery.createdAt.toISOString(),
      new Date().toISOString(),
      attempts,
    );
    const delay = webhookRetryDelayMs(attempts);
    const state = ok ? 'delivered' : open && delay !== null ? 'failed' : 'gave_up';
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        lastStatus: status,
        state,
        nextAttempt: state === 'failed' && delay !== null ? new Date(Date.now() + delay) : null,
      },
    });
    return { state, status };
  }

  sign(secret: string, body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  verify(secret: string, body: string, header: string): boolean {
    const expected = Buffer.from(this.sign(secret, body));
    const got = Buffer.from(header);
    return expected.length === got.length && timingSafeEqual(expected, got);
  }
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(WebhookDispatcher) private readonly dispatcher: WebhookDispatcher,
  ) {}

  @Get()
  @Scopes('webhooks:manage')
  @ApiOperation({ summary: 'List webhook endpoints (RF-11010)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    respondJson(
      req,
      res,
      200,
      {
        items: rows.map((row) => ({
          id: row.id,
          url: row.url,
          events: row.events,
          active: row.active,
        })),
      },
      false,
    );
  }

  @Post()
  @Scopes('webhooks:manage')
  @ApiOperation({ summary: 'Create a signed webhook (RF-11010)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: WebhookDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await assertPublicUrl(dto.url);
    const secret = dto.secret ?? randomBytes(24).toString('base64url');
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.webhookEndpoint.create({
        data: {
          ownerId: user.id,
          url: dto.url,
          secret: sealField(secret),
          events: dto.events,
          active: dto.active ?? true,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.webhookCreated,
        entityType: 'webhook',
        entityId: created.id,
        action: 'created',
        data: asJson({ url: created.url, events: created.events }),
        previous: null,
      });
      return created;
    });
    respondJson(req, res, 201, { id: row.id, url: row.url, secret, events: row.events }, false);
  }

  @Patch(':id')
  @Scopes('webhooks:manage')
  @ApiOperation({ summary: 'Pause or resume a webhook (RF-11010)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WebhookPatchDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const current = await this.owned(user.id, id);
    const row = await this.prisma.webhookEndpoint.update({
      where: { id: current.id },
      data: { ...(dto.active !== undefined ? { active: dto.active } : {}) },
    });
    respondJson(
      req,
      res,
      200,
      { id: row.id, url: row.url, events: row.events, active: row.active },
      false,
    );
  }

  @Post(':id/rotate')
  @Scopes('webhooks:manage')
  @ApiOperation({ summary: 'Rotate a webhook secret. The new secret is shown once (RF-11010)' })
  async rotate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const current = await this.owned(user.id, id);
    const secret = randomBytes(24).toString('base64url');
    await this.prisma.webhookEndpoint.update({
      where: { id: current.id },
      data: { secret: sealField(secret) },
    });
    respondJson(req, res, 200, { id: current.id, secret }, false);
  }

  @Delete(':id')
  @Scopes('webhooks:manage')
  @ApiOperation({ summary: 'Remove a webhook' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'webhook_not_found', 'Webhook was not found');
    }
    await this.prisma.webhookEndpoint.updateMany({
      where: { id, ownerId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.status(204).end();
  }

  @Post(':id/ping')
  @Scopes('webhooks:manage')
  @ApiOperation({ summary: 'Send a test ping (RF-11010)' })
  async ping(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const endpoint = await this.owned(user.id, id);
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        eventId: randomBytes(16).toString('hex'),
        eventType: 'webhook.ping@v1',
        state: 'pending',
        nextAttempt: new Date(),
      },
    });
    respondJson(req, res, 200, await this.dispatcher.deliverOne(delivery.id, user.id), false);
  }

  @Post('deliveries/:deliveryId/retry')
  @Scopes('webhooks:manage')
  @ApiOperation({ summary: 'Retry a delivery (RF-11010)' })
  async retry(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpoint: { ownerId: user.id } },
    });
    if (delivery === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'delivery_not_found',
        'Delivery was not found',
      );
    }
    respondJson(req, res, 200, await this.dispatcher.deliverOne(delivery.id, user.id), false);
  }

  private async owned(ownerId: string, id: string) {
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'webhook_not_found', 'Webhook was not found');
    }
    return row;
  }
}
