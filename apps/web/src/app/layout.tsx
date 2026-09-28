import type { Metadata, Viewport } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { colors } from '@/lib/tokens';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-fraunces',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Orcadom',
  description: 'Controle financeiro doméstico',
  applicationName: 'Orcadom',
  appleWebApp: {
    capable: true,
    title: 'Orcadom',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: colors.brand,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
