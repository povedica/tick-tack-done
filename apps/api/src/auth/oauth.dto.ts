import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOauthClientDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUrl(
    { require_protocol: true, require_tld: false, protocols: ['http', 'https'] },
    { each: true },
  )
  redirect_uris!: string[];
}

export class OauthClientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  redirect_uris!: string[];
}

export class OauthAuthorizeQueryDto {
  @ApiProperty()
  client_id!: string;

  @ApiProperty()
  redirect_uri!: string;

  @ApiProperty()
  scope!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  code_challenge!: string;

  @ApiProperty({ enum: ['S256'] })
  code_challenge_method!: 'S256';
}

export class OauthConsentDto {
  @ApiProperty()
  @IsString()
  client_id!: string;

  @ApiProperty()
  @IsString()
  redirect_uri!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  scope!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  state!: string;

  @ApiProperty()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  code_challenge!: string;

  @ApiProperty({ enum: ['S256'] })
  @IsIn(['S256'])
  code_challenge_method!: 'S256';

  @ApiProperty()
  @IsBoolean()
  allow!: boolean;

  @ApiProperty({
    required: false,
    description: 'Original scope from the authorization request. Empty means the MCP default set.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requested_scope?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resource?: string;
}

export class OauthConsentViewDto {
  @ApiProperty()
  client_name!: string;

  @ApiProperty({ type: [String] })
  scopes!: string[];

  @ApiProperty()
  redirect_uri!: string;
}

export class OauthRedirectDto {
  @ApiProperty()
  redirect_to!: string;
}

export class OauthTokenDto {
  @ApiProperty({ enum: ['authorization_code', 'refresh_token'] })
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type!: 'authorization_code' | 'refresh_token';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  code_verifier?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  refresh_token?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  scope?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resource?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  client_secret?: string;
}

export class OauthTokenResponseDto {
  @ApiProperty()
  access_token!: string;

  @ApiProperty({ enum: ['Bearer'] })
  token_type!: 'Bearer';

  @ApiProperty()
  expires_in!: number;

  @ApiProperty()
  refresh_token!: string;

  @ApiProperty()
  scope!: string;
}

type PublicGrant = 'authorization_code' | 'refresh_token';

export class RegisterOauthClientDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  redirect_uris!: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  client_name?: string;

  @ApiProperty({ required: false, enum: ['none'] })
  @IsOptional()
  @IsIn(['none'])
  token_endpoint_auth_method?: 'none';

  @ApiProperty({ required: false, isArray: true, enum: ['authorization_code', 'refresh_token'] })
  @IsOptional()
  @IsArray()
  @IsIn(['authorization_code', 'refresh_token'], { each: true })
  grant_types?: PublicGrant[];

  @ApiProperty({ required: false, isArray: true, enum: ['code'] })
  @IsOptional()
  @IsArray()
  @IsIn(['code'], { each: true })
  response_types?: 'code'[];
}

export class RegisteredOauthClientDto {
  @ApiProperty()
  client_id!: string;

  @ApiProperty()
  client_name!: string;

  @ApiProperty({ type: [String] })
  redirect_uris!: string[];

  @ApiProperty({ isArray: true, enum: ['authorization_code', 'refresh_token'] })
  grant_types!: PublicGrant[];

  @ApiProperty({ isArray: true, enum: ['code'] })
  response_types!: 'code'[];

  @ApiProperty({ enum: ['none'] })
  token_endpoint_auth_method!: 'none';
}

export class OauthRevokeDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  token!: string;

  @ApiProperty({ required: false, enum: ['access_token', 'refresh_token'] })
  @IsOptional()
  @IsIn(['access_token', 'refresh_token'])
  token_type_hint?: 'access_token' | 'refresh_token';
}
