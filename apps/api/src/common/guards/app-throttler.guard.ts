import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { THROTTLE_ERROR_MESSAGE } from '../throttle/throttle.constants.js';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    return Promise.reject(
      new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: THROTTLE_ERROR_MESSAGE,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
  }
}
