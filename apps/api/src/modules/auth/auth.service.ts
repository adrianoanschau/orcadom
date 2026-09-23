import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { LoginDto, RegisterDto } from '@orcadom/types';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { PrismaService } from '../../common/prisma.service.js';

type CookieResponse = Pick<Response, 'cookie' | 'clearCookie'>;

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtl = config.get<string>('JWT_ACCESS_EXPIRATION') ?? '15m';
    this.refreshTtl = config.get<string>('JWT_REFRESH_EXPIRATION') ?? '7d';
  }

  async register(dto: RegisterDto, response: CookieResponse) {
    const existing = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado.');
    }

    const user = await this.prisma.client.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        importAlias: { create: { token: createAliasToken() } },
      },
    });
    await this.setSession(response, user.id);
    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, response: CookieResponse) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    await this.setSession(response, user.id);
    return this.toPublicUser(user);
  }

  async refresh(refreshToken: string | undefined, response: CookieResponse) {
    try {
      if (!refreshToken) {
        throw new UnauthorizedException();
      }
      const payload = await this.jwt.verifyAsync<{ sub?: string; type?: string }>(refreshToken, {
        secret: this.refreshSecret,
      });
      if (!payload.sub || payload.type !== 'refresh') {
        throw new UnauthorizedException();
      }
      const user = await this.prisma.client.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException();
      }
      response.cookie(
        'accessToken',
        await this.signAccess(user.id),
        this.cookieOptions(this.accessTtl),
      );
      return { ok: true };
    } catch (error) {
      this.logout(response);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException();
    }
  }

  logout(response: CookieResponse): void {
    const options = this.cookieOptions();
    response.clearCookie('accessToken', options);
    response.clearCookie('refreshToken', options);
  }

  private async setSession(response: CookieResponse, userId: string): Promise<void> {
    response.cookie(
      'accessToken',
      await this.signAccess(userId),
      this.cookieOptions(this.accessTtl),
    );
    response.cookie(
      'refreshToken',
      await this.signRefresh(userId),
      this.cookieOptions(this.refreshTtl),
    );
  }

  private signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: 'access' },
      { secret: this.accessSecret, expiresIn: durationMs(this.accessTtl) / 1000 },
    );
  }

  private signRefresh(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      { secret: this.refreshSecret, expiresIn: durationMs(this.refreshTtl) / 1000 },
    );
  }

  private cookieOptions(ttl?: string) {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
      ...(ttl ? { maxAge: durationMs(ttl) } : {}),
    };
  }

  private toPublicUser(user: { id: string; name: string; email: string }) {
    return { id: user.id, name: user.name, email: user.email };
  }
}

function createAliasToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function durationMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  const amount = match?.[1];
  const unit = match?.[2];
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const factor = unit ? factors[unit] : undefined;
  if (!amount || factor === undefined) {
    throw new Error(`Invalid duration: ${value}`);
  }
  return Number(amount) * factor;
}
