import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const webDir = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(join(webDir, 'package.json'), 'utf8')) as {
  version: string;
};

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: join(webDir, '../..'),
  transpilePackages: ['@orcadom/types'],
  env: {
    NEXT_PUBLIC_APP_VERSION: version.version,
  },
  headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
