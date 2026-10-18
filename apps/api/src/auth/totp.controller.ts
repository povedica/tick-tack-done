import { randomBytes } from 'node:crypto';
import { Body, Controller, HttpStatus, Inject, Injectable, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import type { Request, Response } from 'express';
import { randomBase32, recoveryCodes, sha256Hex, verifyTotp } from '@reflexionia/domain';
import { actorOf, type AuthUser } from './auth-user';
import { CurrentUser } from './current-user.decorator';
import { DomainEvent } from '../events/domain-events';
import { EventRecorder } from '../events/event-recorder';
import { DomainException } from '../http/domain.exception';
import { asJson } from '../http/json';
import { respondJson } from '../http/respond';
import { PrismaService } from '../prisma/prisma.service';
import { Scopes } from './scopes.decorator';

class TotpCodeDto {
  @ApiProperty()
  @IsString()
  @Length(6, 6)
  code!: string;
}

class LoginSecondFactorDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  totp_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recovery_code?: string;
}

@Injectable()
export class TotpService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async begin(user: AuthUser): Promise<{ secret: string; otpauth: string }> {
    const secret = randomBase32(randomBytes(20));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret, totpEnabled: false },
    });
    const otpauth = `otpauth://totp/Reflexionia:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Reflexionia`;
    return { secret, otpauth };
  }

  async confirm(user: AuthUser, code: string): Promise<{ recovery_codes: string[] }> {
    const row = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { totpSecret: true },
    });
    if (row?.totpSecret == null) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Start 2FA first');
    }
    const valid = await verifyTotp(row.totpSecret, code, Date.now());
    if (!valid) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'invalid_totp', 'Invalid code');
    }
    const codes = recoveryCodes(() => randomBytes(2).readUInt16BE(0) / 0x10000);
    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { ownerId: user.id } });
      for (const recovery of codes) {
        await tx.recoveryCode.create({
          data: { ownerId: user.id, codeHash: await sha256Hex(recovery) },
        });
      }
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.totpEnabled,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: asJson({ totp_enabled: true }),
        previous: null,
      });
    });
    return { recovery_codes: codes };
  }

  async disable(user: AuthUser, code: string): Promise<void> {
    const ok = await this.matches(user.id, code, null);
    if (!ok) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'invalid_totp', 'Invalid code');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { totpEnabled: false, totpSecret: null },
      });
      await tx.recoveryCode.deleteMany({ where: { ownerId: user.id } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.totpDisabled,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: asJson({ totp_enabled: false }),
        previous: null,
      });
    });
  }

  /** Used by password login. Dev sessions never reach this. */
  async assertLogin(userId: string, factor: LoginSecondFactorDto): Promise<void> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { totpEnabled: true },
    });
    if (row?.totpEnabled !== true) {
      return;
    }
    const ok = await this.matches(userId, factor.totp_code ?? null, factor.recovery_code ?? null);
    if (!ok) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        factor.totp_code === undefined && factor.recovery_code === undefined
          ? 'totp_required'
          : 'invalid_totp',
        'Second factor required',
      );
    }
  }

  private async matches(
    userId: string,
    code: string | null,
    recovery: string | null,
  ): Promise<boolean> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { totpSecret: true },
    });
    if (
      row?.totpSecret != null &&
      code !== null &&
      (await verifyTotp(row.totpSecret, code, Date.now()))
    ) {
      return true;
    }
    if (recovery === null) {
      return false;
    }
    const hash = await sha256Hex(recovery);
    const saved = await this.prisma.recoveryCode.findFirst({
      where: { ownerId: userId, codeHash: hash, usedAt: null },
    });
    if (saved === null) {
      return false;
    }
    await this.prisma.recoveryCode.update({
      where: { id: saved.id },
      data: { usedAt: new Date() },
    });
    return true;
  }
}

@ApiTags('me')
@Controller('me/totp')
export class TotpController {
  constructor(@Inject(TotpService) private readonly totp: TotpService) {}

  @Post()
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Start TOTP. It is not forced on the dev user.' })
  async begin(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.totp.begin(user), false);
  }

  @Post('confirm')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Confirm TOTP and show recovery codes once' })
  async confirm(
    @CurrentUser() user: AuthUser,
    @Body() dto: TotpCodeDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.totp.confirm(user, dto.code), false);
  }

  @Post('disable')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Turn off TOTP' })
  async disable(
    @CurrentUser() user: AuthUser,
    @Body() dto: TotpCodeDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.totp.disable(user, dto.code);
    res.status(204).end();
  }
}

export { LoginSecondFactorDto };
