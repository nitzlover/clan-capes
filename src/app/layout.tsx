import type { Metadata } from 'next';
import { Syne, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const sans = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Clan Capes',
  description: 'Admin panel for the Minecraft clan capes plugin.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/*
          Material Symbols (outlined). The variable axes — fill 0/1, weight
          100..700 — let icon weight match the surrounding type without
          shipping multiple weights of the font.
        */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-screen bg-ink-950 font-sans text-ink-50 antialiased">
        {children}
      </body>
    </html>
  );
}
