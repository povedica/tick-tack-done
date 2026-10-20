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
import { queryString, requestIp } from './request-params.js';
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
    return this.oauth.registerDynamic(dto, requestIp(req));
  }

  @Get('authorize')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Consent details for Authorization Code + PKCE' })
  @ApiOkResponse({ type: OauthConsentViewDto })
  describe(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Query('client_id') clientId: unknown,
    @Query('redirect_uri') redirectUri: unknown,
    @Query('scope') scope: unknown,
    @Query('state') state: unknown,
    @Query('code_challenge') challenge: unknown,
    @Query('code_challenge_method') method: unknown,
    @Query('resource') resource: unknown,
  ): Promise<OauthConsentViewDto> {
    const resourceValue = queryString(resource);
    return this.oauth.describe(
      user,
      {
        client_id: queryString(clientId),
        redirect_uri: queryString(redirectUri),
        scope: queryString(scope),
        state: queryString(state),
        code_challenge: queryString(challenge),
        code_challenge_method: queryString(method),
        ...(resourceValue.length === 0 ? {} : { resource: resourceValue }),
      },
      requestIp(req),
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
    return this.oauth.consent(user, dto, requestIp(req));
  }

  @Post('token')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange an authorization code or refresh token for a bearer token' })
  @ApiOkResponse({ type: OauthTokenResponseDto })
  token(@Body() dto: OauthTokenDto, @Req() req: Request): Promise<OauthTokenResponseDto> {
    return this.oauth.token(dto, requestIp(req));
  }

  @Post('revoke')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an OAuth access or refresh token (RFC 7009)' })
  revoke(@Body() dto: OauthRevokeDto, @Req() req: Request): Promise<void> {
    return this.oauth.revokePresented(dto.token, requestIp(req));
  }
}
