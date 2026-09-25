import { SetMetadata } from '@nestjs/common';

export const SKIP_HOUSEHOLD_KEY = 'skipHousehold';
export const SkipHousehold = () => SetMetadata(SKIP_HOUSEHOLD_KEY, true);
