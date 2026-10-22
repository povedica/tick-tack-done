import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Scopes } from '../auth/scopes.decorator.js';
import { DriveAttachmentsService } from './attachments.service.js';
import { multipartStream, multipartFileParts } from '../http/multipart-stream.js';
import { DomainException } from '../http/domain.exception.js';
import { DRIVE_ATTACHMENT_MAX_BYTES } from './attachment-limits.js';
export class DriveAttachmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() file_name!: string;
  @ApiProperty() mime_type!: string;
  @ApiProperty() byte_size!: number;
  @ApiProperty() drive_file_id!: string;
  @ApiProperty() web_view_link!: string;
  @ApiProperty({ type: String, nullable: true }) icon_link!: string | null;
  @ApiProperty() source!: string;
  @ApiProperty({ enum: ['ok', 'missing', 'unknown'] }) drive_state!: 'ok' | 'missing' | 'unknown';
}
export class DriveSessionDto {
  @ApiProperty({ maxLength: 240 }) @IsString() @MinLength(1) @MaxLength(240) name!: string;
  @ApiProperty() @IsString() @MaxLength(200) mime_type!: string;
  @ApiProperty({ maximum: DRIVE_ATTACHMENT_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(DRIVE_ATTACHMENT_MAX_BYTES)
  size!: number;
}
export class DriveLinkDto {
  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9_-]{1,200}$/) drive_file_id!: string;
}
export class DriveCompleteDto extends DriveLinkDto {
  @ApiProperty() @IsString() @MaxLength(4096) upload_id!: string;
}
@ApiTags('attachments')
@Controller()
export class DriveAttachmentsController {
  constructor(@Inject(DriveAttachmentsService) private readonly drive: DriveAttachmentsService) {}
  @Get('integrations/drive/picker-config')
  @Scopes('tasks:write')
  @ApiOperation({
    summary:
      'Public browser Picker configuration for the connected owner. The API never returns its Google access or refresh token.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['client_id', 'api_key', 'app_id'],
      properties: {
        client_id: { type: 'string' },
        api_key: { type: 'string' },
        app_id: { type: 'string' },
      },
    },
  })
  async pickerConfig(@CurrentUser() user: AuthUser) {
    await this.drive.assertConnected(user);
    const client_id = process.env.GOOGLE_CLIENT_ID ?? '';
    const api_key = process.env.GOOGLE_PICKER_API_KEY ?? '';
    const app_id = process.env.GOOGLE_PICKER_APP_ID ?? '';
    if (!client_id || !api_key || !app_id)
      throw new DomainException(
        503,
        'drive_picker_not_configured',
        'Drive Picker browser configuration is missing',
      );
    return { client_id, api_key, app_id };
  }
  @Post('tasks/:taskId/attachments/drive-session')
  @Scopes('tasks:write')
  @ApiOperation({
    summary:
      'Start a direct browser-to-Drive resumable upload (100 MiB/file, 50/task). Requires connected Drive; no access token is returned.',
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      required: ['upload_url', 'upload_id'],
      properties: { upload_url: { type: 'string' }, upload_id: { type: 'string' } },
    },
  })
  start(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: DriveSessionDto,
  ) {
    return this.drive.startSession(user, taskId, body);
  }
  @Post('tasks/:taskId/attachments/drive-complete')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Verify a signed upload id and Drive file metadata; store metadata only.',
  })
  @ApiCreatedResponse({ type: DriveAttachmentResponseDto })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: DriveCompleteDto,
  ) {
    return this.drive.complete(user, taskId, body.upload_id, body.drive_file_id);
  }
  @Post('tasks/:taskId/attachments/drive-link')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Link an existing file authorized by Google Picker; metadata only, no copying.',
  })
  @ApiCreatedResponse({ type: DriveAttachmentResponseDto })
  link(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: DriveLinkDto,
  ) {
    return this.drive.link(user, taskId, body.drive_file_id);
  }
  @Post('tasks/:taskId/attachments')
  @Scopes('tasks:write')
  @ApiOperation({
    summary:
      'Stream multipart directly to the user’s Drive (25 MiB/file, 50/task, <=8 MiB buffered). Requires Google Drive connected; ttd stores metadata only.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: DriveAttachmentResponseDto })
  async stream(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Req() req: Request,
  ) {
    await this.drive.ownedTask(user, taskId);
    await this.drive.assertConnected(user);
    const internal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
      req.socket.remoteAddress ?? '',
    );
    const capture = internal && req.header('x-ttd-source') === 'mcp' ? 'mcp' : 'api';
    const result = await multipartStream(req, (file, info) =>
      this.drive.stream(user, taskId, info.filename, multipartFileParts(file), capture),
    );
    const attachment = result.files[0];
    if (!attachment) throw new DomainException(400, 'validation_failed', 'file is required');
    return attachment;
  }
  @Get('tasks/:taskId/attachments')
  @Scopes('tasks:read')
  @ApiOperation({
    summary:
      'List Drive attachment metadata and availability. Files remain links after disconnecting Google.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/DriveAttachmentResponseDto' },
        },
        next_cursor: { type: 'string', nullable: true },
      },
    },
  })
  async list(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return { items: await this.drive.list(user, taskId), next_cursor: null };
  }
  @Get('tasks/:taskId/attachments/:id')
  @Scopes('tasks:read')
  @ApiOperation({
    summary: 'Redirect to the existing Drive web link. No binary download or cache on ttd.',
  })
  @ApiResponse({ status: 302, description: 'Drive webViewLink redirect.' })
  async open(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, await this.drive.open(user, id, taskId));
  }
  @Get('attachments/:id/preview')
  @Scopes('tasks:read')
  @ApiOperation({
    summary:
      'Fetch only a fresh Drive thumbnail URL and redirect without caching; never downloads thumbnail bytes.',
  })
  @ApiResponse({
    status: 302,
    description: 'Fresh thumbnailLink redirect with Cache-Control: no-store.',
  })
  async preview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, await this.drive.preview(user, id));
  }
  @Delete('tasks/:taskId/attachments/:id')
  @Scopes('tasks:write')
  @ApiOperation({
    summary:
      'Remove attachment metadata. Optional trash_in_drive moves the file to Drive trash first; a Drive failure keeps the metadata.',
  })
  @ApiQuery({ name: 'trash_in_drive', type: Boolean, required: false })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('trash_in_drive') trash: string | undefined,
    @Res() res: Response,
  ) {
    if (trash !== undefined && trash !== 'true' && trash !== 'false')
      throw new DomainException(400, 'validation_failed', 'trash_in_drive must be true or false');
    await this.drive.remove(user, taskId, id, trash === 'true');
    res.status(204).end();
  }
}
