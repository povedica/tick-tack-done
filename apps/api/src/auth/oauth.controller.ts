import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { OauthBodyInterceptor } from './oauth-body.interceptor.js';
import {
  CreateOauthClientDto,
  OauthClientDto,
  OauthConsentDto,
  OauthConsentViewDto,
  OauthRedirectDto,
  OauthRevokeDto,
  OauthTokenDto,
  OauthTokenResponseDto,
  RegisterOauthClientDto,
  RegisteredOauthClientDto,
} from './oauth.dto.js';
import { OauthService } from './oauth.service.js';
import { Public, Scopes } from './scopes.decorator.js';
import { ACCOUNT_ADMIN_SCOPE } from './scopes.js';

@ApiTags('oauth')
@Controller('oauth')
@UseInterceptors(OauthBodyInterceptor)
export class OauthController {
  constructor(@Inject(OauthService) private readonly oauth: OauthService) {}

  @Post('clients')
  @Scopes(ACCOUNT_ADMIN_SCOPE)
  @ApiOperation({ summary: 'Register a public OAuth client (PKCE, no secret)' })
  @ApiCreatedResponse({ type: OauthClientDto })
  createClient(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOauthClientDto,
  ): Promise<OauthClientDto> {
    return this.oauth.createClient(user, dto);
  }

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Dynamic client registration for public PKCE clients (RFC 7591)' })
  @ApiCreatedResponse({ type: RegisteredOauthClientDto })
  register(
    @Body() dto: RegisterOauthClientDto,
    @Req() req: Request,
  ): Promise<RegisteredOauthClientDto> {
    return this.oauth.registerDynamic(dto, req.ip ?? 'unknown');
  }

  @Get('authorize')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Consent details for Authorization Code + PKCE' })
  @ApiOkResponse({ type: OauthConsentViewDto })
  describe(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('scope') scope = '',
    @Query('state') state: string,
    @Query('code_challenge') challenge: string,
    @Query('code_challenge_method') method: string,
    @Query('resource') resource?: string,
  ): Promise<OauthConsentViewDto> {
    return this.oauth.describe(
      user,
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: method,
        ...(resource === undefined ? {} : { resource }),
      },
      req.ip ?? 'unknown',
    );
  }

  @Post('authorize')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Approve or deny the consent screen and return the redirect' })
  @ApiCreatedResponse({ type: OauthRedirectDto })
  consent(
    @CurrentUser() user: AuthUser,
    @Body() dto: OauthConsentDto,
    @Req() req: Request,
  ): Promise<OauthRedirectDto> {
    return this.oauth.consent(user, dto, req.ip ?? 'unknown');
  }

  @Post('token')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange an authorization code or refresh token for a bearer token' })
  @ApiOkResponse({ type: OauthTokenResponseDto })
  token(@Body() dto: OauthTokenDto, @Req() req: Request): Promise<OauthTokenResponseDto> {
    return this.oauth.token(dto, req.ip ?? 'unknown');
  }

  @Post('revoke')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an OAuth access or refresh token (RFC 7009)' })
  revoke(@Body() dto: OauthRevokeDto, @Req() req: Request): Promise<void> {
    return this.oauth.revokePresented(dto.token, req.ip ?? 'unknown');
  }
}
