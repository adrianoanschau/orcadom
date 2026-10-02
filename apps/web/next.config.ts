import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { formatAppVersion } from './src/lib/app-version';
import { readReleaseVersion } from './src/lib/release-version';

const webDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: join(webDir, '../..'),
  transpilePackages: ['@orcadom/types'],
  env: {
    NEXT_PUBLIC_APP_VERSION: formatAppVersion(
      readReleaseVersion(webDir),
      process.env.APP_VERSION_SUFFIX,
    ),
  },
  headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
