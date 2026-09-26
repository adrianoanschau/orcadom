import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { LoginDto, RegisterDto } from '@orcadom/types';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { PrismaService } from '../../common/prisma.service.js';
import { HouseholdsService } from '../households/households.service.js';
import {
  cookieMaxAge,
  durationMs,
  hashRefreshToken,
  normalizeEmail,
  refreshTtlFor,
} from './session.js';

type CookieResponse = Pick<Response, 'cookie' | 'clearCookie'>;

interface RefreshPayload {
  sub?: string;
  type?: string;
  jti?: string;
  remember?: boolean;
}

const TIMING_DUMMY_HASH = bcrypt.hashSync('orcadom-invalid-password', 10);

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: string;
  private readonly sessionTtl: string;
  private readonly rememberTtl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly households: HouseholdsService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtl = config.get<string>('JWT_ACCESS_EXPIRATION') ?? '15m';
    this.sessionTtl = config.get<string>('JWT_REFRESH_EXPIRATION') ?? '12h';
    this.rememberTtl = config.get<string>('JWT_REFRESH_REMEMBER_EXPIRATION') ?? '30d';
  }

  async register(dto: RegisterDto, response: CookieResponse) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.client.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado.');
    }

    const user = await this.prisma.client.user.create({
      data: {
        name: dto.name,
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    await this.households.createForUser(user.id, `Família de ${dto.name}`);
    await this.setSession(response, user.id, false);
    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, response: CookieResponse) {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.client.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    const passwordHash = user?.passwordHash ?? TIMING_DUMMY_HASH;
    const validPassword = await bcrypt.compare(dto.password, passwordHash);
    if (!user || !validPassword) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    await this.setSession(response, user.id, dto.rememberMe);
    return this.toPublicUser(user);
  }

  async refresh(refreshToken: string | undefined, response: CookieResponse) {
    try {
      const session = await this.readActiveSession(refreshToken);
      await this.setSession(response, session.userId, session.remember, session.id);
      return { ok: true };
    } catch (error) {
      this.clearCookies(response);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException();
    }
  }

  async logout(refreshToken: string | undefined, response: CookieResponse): Promise<void> {
    if (refreshToken) {
      try {
        const payload = await this.verifyRefresh(refreshToken);
        if (payload.jti) {
          await this.prisma.client.refreshSession.updateMany({
            where: { id: payload.jti, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      } catch {
        // Cookie inválido: só limpa o navegador.
      }
    }
    this.clearCookies(response);
  }

  private async setSession(
    response: CookieResponse,
    userId: string,
    remember: boolean,
    previousSessionId?: string,
  ): Promise<void> {
    const refreshTtl = refreshTtlFor(remember, this.sessionTtl, this.rememberTtl);
    const sessionId = randomUUID();
    const refreshToken = await this.signRefresh(userId, sessionId, remember, refreshTtl);
    const expiresAt = new Date(Date.now() + durationMs(refreshTtl));

    await this.prisma.client.$transaction([
      this.prisma.client.refreshSession.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
      }),
      ...(previousSessionId
        ? [
            this.prisma.client.refreshSession.updateMany({
              where: { id: previousSessionId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
      this.prisma.client.refreshSession.create({
        data: {
          id: sessionId,
          userId,
          tokenHash: hashRefreshToken(refreshToken),
          remember,
          expiresAt,
        },
      }),
    ]);

    response.cookie(
      'accessToken',
      await this.signAccess(userId),
      this.cookieOptions(cookieMaxAge(this.accessTtl, remember)),
    );
    response.cookie(
      'refreshToken',
      refreshToken,
      this.cookieOptions(cookieMaxAge(refreshTtl, remember)),
    );
  }

  private async readActiveSession(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    const payload = await this.verifyRefresh(refreshToken);
    if (!payload.sub || !payload.jti || payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.client.refreshSession.findUnique({
      where: { id: payload.jti },
    });
    if (session?.tokenHash !== hashRefreshToken(refreshToken)) {
      throw new UnauthorizedException();
    }
    if (session.revokedAt) {
      await this.prisma.client.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.client.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return session;
  }

  private verifyRefresh(token: string): Promise<RefreshPayload> {
    return this.jwt.verifyAsync<RefreshPayload>(token, { secret: this.refreshSecret });
  }

  private clearCookies(response: CookieResponse): void {
    const options = this.cookieOptions();
    response.clearCookie('accessToken', options);
    response.clearCookie('refreshToken', options);
  }

  private signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: 'access' },
      { secret: this.accessSecret, expiresIn: durationMs(this.accessTtl) / 1000 },
    );
  }

  private signRefresh(
    userId: string,
    sessionId: string,
    remember: boolean,
    refreshTtl: string,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: 'refresh', jti: sessionId, remember },
      { secret: this.refreshSecret, expiresIn: durationMs(refreshTtl) / 1000 },
    );
  }

  private cookieOptions(maxAge?: number) {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
      ...(maxAge !== undefined ? { maxAge } : {}),
    };
  }

  private toPublicUser(user: { id: string; name: string; email: string }) {
    return { id: user.id, name: user.name, email: user.email };
  }
}
