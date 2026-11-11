import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import type { Request, Response } from 'express';
import { randomBase32, recoveryCodes, sha256Hex, verifyTotp } from '@reflexionia/domain';
import { actorOf, type AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { DomainException } from '../http/domain.exception.js';
import { asJson } from '../http/json.js';
import { respondJson } from '../http/respond.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { openField, sealField } from '../security/field-cipher.js';
import { AttemptLimiter } from './attempt-limiter.js';
import { Scopes } from './scopes.decorator.js';

class TotpStatusDto {
  @ApiProperty()
  enabled!: boolean;
}

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

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { totpEnabled: true },
    });
    return row?.totpEnabled === true;
  }

  async begin(user: AuthUser): Promise<{ secret: string; otpauth: string }> {
    if (await this.isEnabled(user.id)) {
      throw new DomainException(HttpStatus.CONFLICT, 'totp_enabled', '2FA is already on');
    }
    const secret = randomBase32(randomBytes(20));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: sealField(secret), totpEnabled: false },
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
    const valid = await verifyTotp(openField(row.totpSecret), code, Date.now());
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
      await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(user.sessionId === null ? {} : { id: { not: user.sessionId } }),
        },
        data: { revokedAt: new Date() },
      });
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

  async cancelPending(user: AuthUser): Promise<void> {
    const row = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { totpEnabled: true },
    });
    if (row?.totpEnabled === true) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'totp_enabled',
        'Turn off 2FA with a current code',
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabled: false },
    });
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
      await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(user.sessionId === null ? {} : { id: { not: user.sessionId } }),
        },
        data: { revokedAt: new Date() },
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
      (await verifyTotp(openField(row.totpSecret), code, Date.now()))
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
  constructor(
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(AttemptLimiter) private readonly attempts: AttemptLimiter,
  ) {}

  @Get()
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Whether TOTP is enabled for the current account' })
  @ApiOkResponse({ type: TotpStatusDto })
  async status(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, { enabled: await this.totp.isEnabled(user.id) }, false);
  }

  @Post()
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Start TOTP. It is not forced on the dev user.' })
  async begin(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.guardTotp(req, user.id);
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
    await this.guardTotp(req, user.id);
    try {
      respondJson(req, res, 200, await this.totp.confirm(user, dto.code), false);
    } catch (error) {
      await this.attempts.recordFailure(req.ip ?? 'unknown', `totp:${user.id}`);
      throw error;
    }
  }

  @Delete('pending')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Discard a TOTP secret that was not confirmed' })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.guardTotp(req, user.id);
    await this.totp.cancelPending(user);
    res.status(204).end();
  }

  @Post('disable')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Turn off TOTP' })
  async disable(
    @CurrentUser() user: AuthUser,
    @Body() dto: TotpCodeDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.guardTotp(req, user.id);
    try {
      await this.totp.disable(user, dto.code);
    } catch (error) {
      await this.attempts.recordFailure(req.ip ?? 'unknown', `totp:${user.id}`);
      throw error;
    }
    res.status(204).end();
  }

  private async guardTotp(req: Request, userId: string): Promise<void> {
    const ip = req.ip ?? 'unknown';
    await this.attempts.assertAllowed(ip, `totp:${userId}`);
    await this.attempts.recordAttempt(ip);
  }
}

export { LoginSecondFactorDto };
