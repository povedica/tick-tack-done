import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { respondJson } from '../../http/respond.js';
import {
  ApproveProposalDto,
  CreateMemoryDto,
  PostTickyMessageDto,
  StoreProposalDto,
  UpdateTickyAuthorityDto,
} from './ticky.dto.js';
import { TickyService } from './ticky.service.js';

@ApiTags('ticky')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('ticky')
export class TickyController {
  constructor(@Inject(TickyService) private readonly ticky: TickyService) {}

  @Get('flags')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Ticky feature flags (all off by default)' })
  flags(@CurrentUser() _user: AuthUser, @Req() req: Request, @Res() res: Response): void {
    respondJson(req, res, 200, this.ticky.flags(), true);
  }

  @Get('capabilities')
  @Scopes('tasks:read', 'lists:read')
  @ApiOperation({ summary: 'Closed read_capabilities.proposed.v1 for the Ticky reader (APP-02)' })
  async capabilities(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.capabilities(user), false);
  }

  @Patch('authority')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Update Ticky authority (own lists only; APP-02)' })
  async updateAuthority(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTickyAuthorityDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.updateAuthority(user, dto), false);
  }

  @Post('reader')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Issue a list-restricted read-only PAT for the Python reader' })
  async issueReader(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.ticky.issueReader(user), false);
  }

  @Get('context')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Build a ContextSnapshot for planning (APP-05)' })
  async context(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.context(user), false);
  }

  @Get('models')
  @Scopes('ticky:proposals:read')
  @ApiOperation({ summary: 'List models granted server-side; empty while generation is disabled' })
  async models(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.models(user), false);
  }

  @Post('threads')
  @Scopes('ticky:proposals:write')
  @ApiOperation({ summary: 'Open a Ticky chat thread (APP-03)' })
  async openThread(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.ticky.openThread(user), false);
  }

  @Get('threads')
  @Scopes('ticky:proposals:read')
  @ApiOperation({ summary: 'List Ticky chat threads' })
  async listThreads(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.listThreads(user), true);
  }

  @Get('threads/:id/messages')
  @Scopes('ticky:proposals:read')
  @ApiOperation({
    summary: 'Read canonical Python conversation history for the authenticated owner',
  })
  async threadMessages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.threadMessages(user, id), false);
  }

  @Delete('threads/:id')
  @Scopes('ticky:proposals:write')
  @ApiOperation({
    summary: 'Delete canonical conversation history; return pending until checkpoints are erased',
  })
  async deleteThread(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.ticky.deleteThread(user, id);
    res.status(result.state === 'pending' ? 202 : 200).json(result);
  }

  @Post('threads/:id/messages')
  @Scopes('ticky:proposals:write')
  @ApiOperation({ summary: 'Post a chat message (idempotent client_message_id)' })
  async postMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostTickyMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.ticky.postMessage(
      user,
      id,
      dto.client_message_id,
      dto.text,
      dto.model_id,
    );
    respondJson(req, res, result.status, result.body, false);
  }

  @Get('runs/:id/events')
  @Scopes('ticky:proposals:read')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: 'Proxy async run events (SSE; APP-03)' })
  async runEvents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.ticky.streamRunEvents(user, id, cursor, req, res);
  }

  @Post('runs/:id/cancel')
  @Scopes('ticky:proposals:write')
  @ApiOperation({ summary: 'Cancel a run (does not undo domain effects)' })
  async cancelRun(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.cancelRun(user, id), false);
  }

  @Post('proposals')
  @Scopes('ticky:proposals:write')
  @ApiOperation({ summary: 'Store an immutable proposal document' })
  async storeProposal(
    @CurrentUser() user: AuthUser,
    @Body() dto: StoreProposalDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.ticky.storeProposal(user, dto.document), false);
  }

  @Post('proposals/:id/approve')
  @Scopes('ticky:proposals:write')
  @ApiOperation({ summary: 'Approve a subset of proposal actions (APP-04)' })
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveProposalDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.ticky.approve(user, id, dto.digest, dto.selected_actions),
      false,
    );
  }

  @Get('actions/:id')
  @Scopes('ticky:proposals:read')
  @ApiOperation({ summary: 'Ledger status for an action_id (uncertain delivery)' })
  async actionStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.actionStatus(user, id), false);
  }

  @Get('memories')
  @Scopes('ticky:proposals:read')
  @ApiOperation({ summary: 'List remembered preferences (APP-08)' })
  async listMemories(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.listMemories(user), true);
  }

  @Post('memories')
  @Scopes('ticky:proposals:write')
  @ApiOperation({ summary: 'Store a memory entry' })
  async remember(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMemoryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      201,
      await this.ticky.remember(user, dto.body, dto.source_message_id ?? null),
      false,
    );
  }

  @Delete('memories/:id')
  @Scopes('ticky:proposals:write')
  @ApiOperation({ summary: 'Forget a memory (soft)' })
  async forgetMemory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.ticky.forgetMemory(user, id);
    res.status(204).end();
  }

  @Get('routines')
  @Scopes('ticky:routines:read')
  @ApiOperation({ summary: 'List shadow routines (paused by default; APP-08)' })
  async listRoutines(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.ticky.listRoutines(user), true);
  }
}
