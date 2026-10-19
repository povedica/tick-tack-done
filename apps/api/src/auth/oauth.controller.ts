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
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainException } from '../http/domain.exception';
import type { AuthUser } from './auth-user';
import { CurrentUser } from './current-user.decorator';
import {
  CreateOauthClientDto,
  OauthClientDto,
  OauthConsentDto,
  OauthConsentViewDto,
  OauthRedirectDto,
  OauthTokenDto,
  OauthTokenResponseDto,
} from './oauth.dto';
import { OauthService } from './oauth.service';
import { Public, Scopes } from './scopes.decorator';
import { ACCOUNT_ADMIN_SCOPE } from './scopes';

@ApiTags('oauth')
@Controller('oauth')
export class OauthController {
  constructor(@Inject(OauthService) private readonly oauth: OauthService) {}

  @Post('clients')
  @Scopes(ACCOUNT_ADMIN_SCOPE)
  @ApiOperation({ summary: 'Register a public OAuth client (PKCE, no secret)' })
  @ApiOkResponse({ type: OauthClientDto })
  createClient(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOauthClientDto,
  ): Promise<OauthClientDto> {
    return this.oauth.createClient(user, dto);
  }

  @Get('authorize')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Consent details for Authorization Code + PKCE' })
  @ApiOkResponse({ type: OauthConsentViewDto })
  describe(
    @CurrentUser() user: AuthUser,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('scope') scope: string,
    @Query('state') state: string,
    @Query('code_challenge') challenge: string,
    @Query('code_challenge_method') method: string,
  ): Promise<OauthConsentViewDto> {
    if (method !== 'S256' || state.trim().length < 8 || challenge.length < 43) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid authorize request',
      );
    }
    return this.oauth.describe(user, { client_id: clientId, redirect_uri: redirectUri, scope });
  }

  @Post('authorize')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Approve or deny the consent screen and return the redirect' })
  @ApiOkResponse({ type: OauthRedirectDto })
  consent(@CurrentUser() user: AuthUser, @Body() dto: OauthConsentDto): Promise<OauthRedirectDto> {
    return this.oauth.consent(user, dto);
  }

  @Post('token')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange an authorization code and PKCE verifier for a bearer token' })
  @ApiOkResponse({ type: OauthTokenResponseDto })
  token(@Body() dto: OauthTokenDto, @Req() req: Request): Promise<OauthTokenResponseDto> {
    return this.oauth.token(dto, req.ip ?? 'unknown');
  }
}
