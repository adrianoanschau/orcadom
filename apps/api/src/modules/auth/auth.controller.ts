import { Controller, HttpCode, HttpStatus, Post, Req, Res, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginBody, RegisterBody } from './auth.dto.js';

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
}
