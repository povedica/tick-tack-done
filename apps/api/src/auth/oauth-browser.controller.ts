import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OauthService } from './oauth.service.js';
import { queryString, requestIp } from './request-params.js';
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
    @Query('client_id') clientId: unknown,
    @Query('redirect_uri') redirectUri: unknown,
    @Query('scope') scope: unknown,
    @Query('state') state: unknown,
    @Query('code_challenge') challenge: unknown,
    @Query('code_challenge_method') method: unknown,
    @Query('resource') resource: unknown,
  ): Promise<void> {
    const resourceValue = queryString(resource);
    const location = await this.oauth.browserAuthorize(
      {
        client_id: queryString(clientId),
        redirect_uri: queryString(redirectUri),
        scope: queryString(scope),
        state: queryString(state),
        code_challenge: queryString(challenge),
        code_challenge_method: queryString(method),
        ...(resourceValue.length === 0 ? {} : { resource: resourceValue }),
      },
      req.header('cookie'),
      requestIp(req),
    );
    res.redirect(302, location);
  }
}
