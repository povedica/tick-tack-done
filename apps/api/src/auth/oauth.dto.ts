import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
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
  @MaxLength(500)
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
  @ApiProperty({ enum: ['authorization_code'] })
  @IsIn(['authorization_code'])
  grant_type!: 'authorization_code';

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  redirect_uri!: string;

  @ApiProperty()
  @IsString()
  client_id!: string;

  @ApiProperty()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  code_verifier!: string;
}

export class OauthTokenResponseDto {
  @ApiProperty()
  access_token!: string;

  @ApiProperty({ enum: ['Bearer'] })
  token_type!: 'Bearer';

  @ApiProperty()
  scope!: string;
}
