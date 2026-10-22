import { McpRevision } from './mcp-revision.js';
import { Body, Controller, Delete, Get, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Authenticated } from '../auth/scopes.decorator.js';
import { McpService } from './mcp.service.js';

const POST_SUMMARY =
  'Stateless Streamable HTTP JSON-RPC (RF-2001). POST returns application/json; a notification returns 202 with an empty body. GET with Accept: text/event-stream offers catalog change notifications; DELETE returns 405. No Mcp-Session-Id. A tool is listed only when the token holds every scope it declares.';

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(@Inject(McpService) private readonly mcp: McpService, @Inject(McpRevision) private readonly revision: McpRevision) {}

  @Post()
  @Authenticated()
  @ApiOperation({ summary: POST_SUMMARY })
  @ApiResponse({ status: 200, description: 'JSON-RPC result as application/json.' })
  @ApiResponse({ status: 202, description: 'Notification accepted. Empty body.' })
  @ApiResponse({ status: 401, description: 'Missing credential or invalid bearer token.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jsonrpc', 'method'],
      properties: {
        jsonrpc: { type: 'string', example: '2.0' },
        id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        method: { type: 'string', example: 'tools/list' },
        params: { type: 'object' },
      },
    },
  })
  async handle(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const result = await this.mcp.handle(user, body, req.headers.authorization);
    if (result === null) {
      res.status(HttpStatus.ACCEPTED).end();
      return;
    }
    res.status(HttpStatus.OK).json(result);
  }

  @Get()
  @Authenticated()
  @ApiOperation({
    summary:
      'Authenticated SSE catalog-change notifications (RF-2001); other Accept headers return 405.',
  })
  @ApiResponse({ status: 200, description: 'SSE stream; notifications/tools/list_changed when the persisted catalog hash changed.' })
  @ApiResponse({
    status: 405,
    description:
      'Method Not Allowed. Empty body, Allow: POST, no Mcp-Session-Id. A 404 would mean the session ended.',
    headers: {
      Allow: { description: 'POST', schema: { type: 'string', example: 'POST' } },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing credential or invalid bearer token.' })
  async get(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (!req.headers.accept?.includes('text/event-stream')) { this.methodNotAllowed(res); return; }
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(': catalog stream\n\n');
    if (await this.revision.consume(user.tokenId ?? user.sessionId ?? user.id)) {
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })}\n\n`);
    }
    const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 25000);
    req.on('close', () => { clearInterval(heartbeat); });
  }

  @Delete()
  @Authenticated()
  @ApiOperation({
    summary: 'There is no MCP session to close. Returns 405 with Allow: POST (RF-2001).',
  })
  @ApiResponse({
    status: 405,
    description: 'Method Not Allowed. Empty body, Allow: POST, no Mcp-Session-Id.',
    headers: {
      Allow: { description: 'POST', schema: { type: 'string', example: 'POST' } },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing credential or invalid bearer token.' })
  remove(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response): void {
    res.setHeader('Allow', 'POST');
    res.status(HttpStatus.METHOD_NOT_ALLOWED).end();
  }
}
