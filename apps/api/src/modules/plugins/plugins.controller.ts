import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { parsePluginManifest, pluginMay } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';

/** Section 12. The API stores the manifest. The plugin process is not this process. */
@ApiTags('plugins')
@Controller('plugins')
export class PluginsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get()
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Installed plugins (section 12)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.pluginInstall.findMany({
      where: { ownerId: user.id, deletedAt: null },
    });
    respondJson(
      req,
      res,
      200,
      {
        items: rows.map((row) => ({
          id: row.id,
          plugin_id: row.pluginId,
          enabled: row.enabled,
          manifest: row.manifest,
        })),
      },
      false,
    );
  }

  @Get('widgets')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Widgets registered by plugins (RF-2105)' })
  async widgets(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.pluginInstall.findMany({
      where: { ownerId: user.id, deletedAt: null, enabled: true },
    });
    const widgets = rows.flatMap((row) => {
      const parsed = parsePluginManifest(row.manifest);
      if (!parsed.ok || !pluginMay(parsed.manifest, 'ui:widgets')) {
        return [];
      }
      return [{ plugin_id: parsed.manifest.id, name: parsed.manifest.name }];
    });
    respondJson(req, res, 200, { items: widgets }, false);
  }

  @Post()
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Install a plugin from its manifest. It does not run inside the API.' })
  async install(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = parsePluginManifest(body);
    if (!parsed.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', parsed.reason);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.pluginInstall.upsert({
        where: { ownerId_pluginId: { ownerId: user.id, pluginId: parsed.manifest.id } },
        create: {
          ownerId: user.id,
          pluginId: parsed.manifest.id,
          manifest: asJson(parsed.manifest),
        },
        update: { manifest: asJson(parsed.manifest), enabled: true, deletedAt: null },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.pluginInstalled,
        entityType: 'plugin',
        entityId: saved.id,
        action: 'created',
        data: asJson({ plugin_id: parsed.manifest.id, permissions: parsed.manifest.permissions }),
        previous: null,
      });
      return saved;
    });
    respondJson(req, res, 201, { id: row.id, plugin_id: row.pluginId, isolated: true }, false);
  }

  @Delete(':pluginId')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Remove a plugin' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('pluginId') pluginId: string,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.pluginInstall.findFirst({
      where: { ownerId: user.id, pluginId, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'plugin_not_found', 'Plugin was not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.pluginInstall.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), enabled: false },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.pluginRemoved,
        entityType: 'plugin',
        entityId: row.id,
        action: 'deleted',
        data: asJson({ plugin_id: pluginId }),
        previous: null,
      });
    });
    res.status(204).end();
  }
}
