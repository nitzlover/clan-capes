import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clan Capes',
  description: 'Admin panel for the Minecraft clan capes plugin.',
};

/**
 * Geist Sans is Vercel's editorial workhorse — wide-set caps + tight
 * tabular numerals match the brutalist + tabular dashboard tone better
 * than Syne, and it ships in the same `next/font` pipeline so the
 * critical-CSS bundle stays the same size. Geist Mono replaces IBM
 * Plex Mono for the same reason; consistency of metric across UI +
 * code stamps + log lines.
 *
 * Material Symbols is deliberately gone — every icon now comes from
 * Lucide React (tree-shaken, ~1 KB per icon, no remote font fetch).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/*
          Material Symbols still loads for backwards-compat with the
          handful of pages that haven't migrated to Lucide React yet
          (audit, banners, capes, ClanSelect, UploadSection). Each is
          a separate PR; once they're all on Lucide this link goes.
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
