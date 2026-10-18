import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Authenticated } from '../auth/scopes.decorator';
import { McpService } from './mcp.service';

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(@Inject(McpService) private readonly mcp: McpService) {}

  @Post()
  @Authenticated()
  @ApiOperation({
    summary:
      'MCP JSON-RPC (RF-2001). Tools use API v1 and cannot exceed the bearer token scopes. Notes are not exposed.',
  })
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
      res.status(202).end();
      return;
    }
    res.status(200).json(result);
  }
}
