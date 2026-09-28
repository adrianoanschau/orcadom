import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

const version = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

const nextConfig: NextConfig = {
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
