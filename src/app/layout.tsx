import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clan Capes Panel',
  description: 'Manage clan custom capes for Minecraft',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
