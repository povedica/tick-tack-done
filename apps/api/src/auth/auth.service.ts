import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { actorOf, type AuthUser } from './auth-user';
import { DomainEvent } from '../events/domain-events';
import { EventRecorder } from '../events/event-recorder';
import { DomainException } from '../http/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto, RegisterDto, SessionListItemDto, SessionResponseDto } from './auth.dto';
import { AttemptLimiter } from './attempt-limiter';
import { hashPassword, verifyPresentedPassword } from './passwords';
import { requireBrowserSession } from './session-access';
import { newSessionSecret, SESSION_MAX_AGE_MS } from './session-cookie';
import { TotpService } from './totp.controller';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(AttemptLimiter) private readonly attempts: AttemptLimiter,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta): Promise<IssuedLogin> {
    const email = normalizeEmail(dto.email);
    const ip = meta.ip ?? 'unknown';
    await this.attempts.assertAllowed(ip, email);
    await this.attempts.recordAttempt(ip);
    const existing = await this.prisma.user.count({ where: { deletedAt: null } });
    if (existing > 0 && process.env.REGISTRATION_OPEN !== 'true') {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'registration_closed',
        'Registration is closed',
      );
    }
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            displayName: dto.display_name.trim(),
            timeZone: 'Europe/Madrid',
          },
        });
        await tx.project.create({
          data: { ownerId: created.id, name: 'Bandeja de entrada', isInbox: true },
        });
        return created;
      });
      return await this.openSession(user.id, meta);
    } catch (error) {
      if (isUnique(error)) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'email_taken',
          'Email is already registered',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<IssuedLogin> {
    const email = normalizeEmail(dto.email);
    const ip = meta.ip ?? 'unknown';
    await this.attempts.assertAllowed(ip, email);
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    const valid = await verifyPresentedPassword(user?.passwordHash ?? null, dto.password);
    if (user === null || !valid) {
      await this.attempts.recordFailure(ip, email);
      if (user !== null) {
        await this.prisma.activityLog.create({
          data: {
            ownerId: user.id,
            actorId: user.id,
            entityType: 'session',
            entityId: user.id,
            action: 'accessed',
            changes: { outcome: 'login_failed', ip },
          },
        });
      }
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'invalid_credentials',
        'Invalid credentials',
      );
    }
    await this.attempts.recordAttempt(ip);
    await this.attempts.clearSubject(email);
    await this.totp.assertLogin(user.id, dto);
    return this.openSession(user.id, meta);
  }

  async logout(user: AuthUser): Promise<void> {
    if (user.sessionId === null) {
      return;
    }
    await this.revoke(user, user.sessionId);
  }

  async profile(user: AuthUser, csrf: string): Promise<SessionResponseDto> {
    const row = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { id: true, email: true, displayName: true },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Unknown user');
    }
    return { id: row.id, email: row.email, display_name: row.displayName, csrf_token: csrf };
  }

  async list(user: AuthUser): Promise<SessionListItemDto[]> {
    requireBrowserSession(user);
    const rows = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      created_at: row.createdAt.toISOString(),
      last_used_at: row.lastUsedAt.toISOString(),
      user_agent: row.userAgent,
      current: row.id === user.sessionId,
    }));
  }

  async revoke(user: AuthUser, id: string): Promise<void> {
    requireBrowserSession(user);
    const row = await this.prisma.session.findFirst({
      where: { id, userId: user.id, revokedAt: null },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'session_not_found', 'Session was not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.sessionRevoked,
        entityType: 'session',
        entityId: id,
        action: 'deleted',
        data: { session: { id } },
        previous: null,
      });
    });
  }

  private async openSession(userId: string, meta: RequestMeta): Promise<IssuedLogin> {
    const issued = newSessionSecret();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId,
          tokenHash: issued.hash,
          csrfToken: issued.csrf,
          userAgent: meta.userAgent,
          ip: meta.ip,
          expiresAt,
        },
      });
      await this.events.record(
        tx,
        { ownerId: userId, actorId: userId, actorKind: 'user', tokenId: null },
        {
          type: DomainEvent.sessionCreated,
          entityType: 'session',
          entityId: created.id,
          action: 'created',
          data: { session: { id: created.id } },
          previous: null,
        },
      );
      return created;
    });
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    const body: SessionResponseDto = {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      csrf_token: issued.csrf,
    };
    return { body, token: issued.token, sessionId: session.id };
  }
}

export interface RequestMeta {
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export interface IssuedLogin {
  readonly body: SessionResponseDto;
  readonly token: string;
  readonly sessionId: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUnique(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
