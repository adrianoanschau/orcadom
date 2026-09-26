import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipHousehold } from '../../common/decorators/skip-household.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginBody, RegisterBody, UpdateProfileBody } from './auth.dto.js';

type CookieResponse = Pick<Response, 'cookie' | 'clearCookie'>;
interface CookieRequest {
  cookies?: Record<string, string | undefined>;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: RegisterBody, @Res({ passthrough: true }) response: CookieResponse) {
    return this.auth.register(body, response);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: LoginBody, @Res({ passthrough: true }) response: CookieResponse) {
    return this.auth.login(body, response);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    return this.auth.refresh(request.cookies?.refreshToken, response);
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
