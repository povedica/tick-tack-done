import { Controller, Inject, Module, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../auth/scopes.decorator.js';
import { SentryTunnel } from './tunnel.js';

@ApiTags('observability')
@Controller('sentry-tunnel')
export class SentryTunnelController {
  constructor(@Inject(SentryTunnel) private readonly tunnel: SentryTunnel) {}

  @Post()
  @Public()
  @ApiOperation({
    summary:
      'Relay one PWA error envelope to Sentry (#209). Only the ttd-web DSN is accepted, 64 KiB max, 30 per minute per IP. Client IP, cookies and referer are never forwarded. Answers 204 and drops the envelope while SENTRY_TUNNEL_ENABLED is not true.',
  })
  @ApiConsumes('text/plain', 'application/x-sentry-envelope')
  @ApiBody({ schema: { type: 'string', description: 'Sentry envelope' } })
  @ApiOkResponse({ description: 'Sentry answer, passed through' })
  @ApiNoContentResponse({ description: 'Tunnel off: envelope dropped' })
  relay(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.tunnel.handle(req, res);
  }
}

@Module({
  controllers: [SentryTunnelController],
  providers: [{ provide: SentryTunnel, useFactory: () => new SentryTunnel(process.env) }],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class SentryTunnelModule {}
