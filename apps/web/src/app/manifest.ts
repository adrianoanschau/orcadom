import type { MetadataRoute } from 'next';
import { colors } from '@/lib/tokens';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Orcadom',
    short_name: 'Orcadom',
    description: 'Controle financeiro doméstico',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    lang: 'pt-BR',
    dir: 'ltr',
    background_color: colors.canvas,
    theme_color: colors.brand,
    categories: ['finance'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
