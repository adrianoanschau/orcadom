import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

loadEnv({ path: resolve(import.meta.dirname, '../../.env') });

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
