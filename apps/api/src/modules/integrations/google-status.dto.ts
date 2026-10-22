import { ApiProperty } from '@nestjs/swagger';
export class GoogleServiceAccessDto {
  @ApiProperty({
    description:
      'True only when the token has the required granted scopes and is not known revoked',
  })
  authorized!: boolean;
  @ApiProperty({ description: 'Local activation; disabling does not revoke the Google grant' })
  enabled!: boolean;
  @ApiProperty() connected!: boolean;
  @ApiProperty({
    enum: [
      'connected',
      'disabled',
      'permission_required',
      'permissions_unknown',
      'reauth_required',
      'disconnected',
    ],
  })
  status!: string;
}
export class GoogleIntegrationStatusDto extends GoogleServiceAccessDto {
  @ApiProperty() configured!: boolean;
  @ApiProperty({ type: String, nullable: true }) account!: string | null;
}
export class GoogleServicesDto {
  @ApiProperty({ type: GoogleServiceAccessDto }) calendar!: GoogleServiceAccessDto;
  @ApiProperty({ type: GoogleServiceAccessDto }) drive!: GoogleServiceAccessDto;
}
export class GoogleConnectionStatusDto extends GoogleIntegrationStatusDto {
  @ApiProperty() has_connection!: boolean;
  @ApiProperty() connection_status!: string;
  @ApiProperty({ type: GoogleServicesDto }) services!: GoogleServicesDto;
}
