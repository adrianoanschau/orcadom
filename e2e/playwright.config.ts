import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env'),
  quiet: true,
});

const baseURL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
  },
  projects: [
    {
      name: 'smoke',
      testMatch: 'smoke/**/*.spec.ts',
    },
    {
      name: 'full',
      testMatch: '{smoke,full}/**/*.spec.ts',
    },
  ],
});
