import { Body, Controller, Delete, Get, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Authenticated } from '../auth/scopes.decorator.js';
import { McpService } from './mcp.service.js';

const POST_SUMMARY =
  'Stateless Streamable HTTP JSON-RPC (RF-2001). POST returns application/json; a notification returns 202 with an empty body. GET and DELETE on this path return 405 with Allow: POST until a server-sent stream exists. No Mcp-Session-Id. A tool is listed only when the token holds every scope it declares.';

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(@Inject(McpService) private readonly mcp: McpService) {}

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
  ): Promise<void> {
    const result = await this.mcp.handle(user, body);
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
      'SSE is not offered. Returns 405 so a Streamable HTTP client keeps using POST (RF-2001).',
  })
  @ApiResponse({
    status: 405,
    description:
      'Method Not Allowed. Empty body, Allow: POST, no Mcp-Session-Id. A 404 would mean the session ended.',
    headers: {
      Allow: { description: 'POST', schema: { type: 'string', example: 'POST' } },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing credential or invalid bearer token.' })
  get(@Res() res: Response): void {
    this.methodNotAllowed(res);
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
