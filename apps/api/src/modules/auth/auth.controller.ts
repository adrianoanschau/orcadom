import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipHousehold } from '../../common/decorators/skip-household.decorator.js';
import {
  THROTTLE_LOGIN_LIMIT,
  THROTTLE_TTL_MS,
} from '../../common/throttle/throttle.constants.js';
import { AuthService, type SessionRequest } from './auth.service.js';
import { ChangePasswordBody, LoginBody, RegisterBody, UpdateProfileBody } from './auth.dto.js';

type CookieResponse = Pick<Response, 'cookie' | 'clearCookie'>;
interface CookieRequest extends SessionRequest {
  cookies?: Record<string, string | undefined>;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(
    @Body() body: RegisterBody,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.auth.register(body, response, request);
  }

  @Public()
  @Throttle({ default: { limit: THROTTLE_LOGIN_LIMIT, ttl: THROTTLE_TTL_MS } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() body: LoginBody,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.auth.login(body, response, request);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    return this.auth.refresh(request.cookies?.refreshToken, response, request);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    return this.auth.logout(request.cookies?.refreshToken, response);
  }

  @SkipHousehold()
  @ApiCookieAuth('accessToken')
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.auth.me(userId);
  }

  @SkipHousehold()
  @ApiCookieAuth('accessToken')
  @Patch('me')
  updateMe(@CurrentUser() userId: string, @Body() body: UpdateProfileBody) {
    return this.auth.updateProfile(userId, body);
  }
}

@ApiTags('profile')
@ApiCookieAuth('accessToken')
@SkipHousehold()
@Controller('profile')
export class ProfileController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  get(@CurrentUser() userId: string) {
    return this.auth.me(userId);
  }

  @Patch()
  update(@CurrentUser() userId: string, @Body() body: UpdateProfileBody) {
    return this.auth.updateProfile(userId, body);
  }

  @Patch('password')
  changePassword(@CurrentUser() userId: string, @Body() body: ChangePasswordBody) {
    return this.auth.changePassword(userId, body);
  }
}
