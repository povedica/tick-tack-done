import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OauthService } from './oauth.service.js';
import { Public } from './scopes.decorator.js';

@ApiTags('oauth')
@Controller('browser-oauth')
export class OauthBrowserController {
  constructor(@Inject(OauthService) private readonly oauth: OauthService) {}

  @Get('authorize')
  @Public()
  @ApiOperation({
    summary:
      'Browser entry for Authorization Code + PKCE. Redirects to login or the consent screen.',
  })
  @ApiFoundResponse({ description: 'Redirect to /login or /oauth/consent' })
  async authorize(
    @Req() req: Request,
    @Res() res: Response,
    @Query('client_id') clientId = '',
    @Query('redirect_uri') redirectUri = '',
    @Query('scope') scope = '',
    @Query('state') state = '',
    @Query('code_challenge') challenge = '',
    @Query('code_challenge_method') method = '',
    @Query('resource') resource?: string,
  ): Promise<void> {
    const location = await this.oauth.browserAuthorize(
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: method,
        ...(resource === undefined ? {} : { resource }),
      },
      req.header('cookie'),
      req.ip ?? 'unknown',
    );
    res.redirect(302, location);
  }
}
