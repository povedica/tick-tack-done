import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { API_SCOPES } from './scopes.js';
import { Public } from './scopes.decorator.js';
import { mcpResourceUrl, protectedResourceMetadataUrl, publicOrigin } from './public-origin.js';

class ProtectedResourceMetadataDto {
  @ApiProperty()
  resource!: string;

  @ApiProperty({ type: [String] })
  authorization_servers!: string[];

  @ApiProperty({ type: [String] })
  scopes_supported!: string[];

  @ApiProperty({ type: [String] })
  bearer_methods_supported!: string[];
}

class AuthorizationServerMetadataDto {
  @ApiProperty()
  issuer!: string;

  @ApiProperty()
  authorization_endpoint!: string;

  @ApiProperty()
  token_endpoint!: string;

  @ApiProperty()
  registration_endpoint!: string;

  @ApiProperty({ type: [String] })
  response_types_supported!: string[];

  @ApiProperty({ type: [String] })
  grant_types_supported!: string[];

  @ApiProperty({ type: [String] })
  code_challenge_methods_supported!: string[];

  @ApiProperty({ type: [String] })
  token_endpoint_auth_methods_supported!: string[];

  @ApiProperty({ type: [String] })
  scopes_supported!: string[];

  @ApiProperty()
  authorization_response_iss_parameter_supported!: boolean;
}

@ApiTags('oauth')
@Controller('.well-known')
export class OauthDiscoveryController {
  @Get('oauth-protected-resource')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'OAuth protected resource metadata for the MCP server (RFC 9728)' })
  @ApiOkResponse({ type: ProtectedResourceMetadataDto })
  protectedResource(): ProtectedResourceMetadataDto {
    const origin = publicOrigin();
    return {
      resource: mcpResourceUrl(),
      authorization_servers: [origin],
      scopes_supported: [...API_SCOPES],
      bearer_methods_supported: ['header'],
    };
  }

  @Get('oauth-authorization-server')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'OAuth authorization server metadata (RFC 8414)' })
  @ApiOkResponse({ type: AuthorizationServerMetadataDto })
  authorizationServer(): AuthorizationServerMetadataDto {
    const origin = publicOrigin();
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/v1/oauth/token`,
      registration_endpoint: `${origin}/api/v1/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...API_SCOPES],
      authorization_response_iss_parameter_supported: true,
    };
  }
}

export function oauthChallenge(): string {
  return `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`;
}
