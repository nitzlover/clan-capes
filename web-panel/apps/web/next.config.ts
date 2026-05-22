import type { NextConfig } from 'next';

const apiInternal = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/health', destination: `${apiInternal}/health` },
      { source: '/auth/:path*', destination: `${apiInternal}/auth/:path*` },
      { source: '/panel/:path*', destination: `${apiInternal}/panel/:path*` },
      { source: '/static/:path*', destination: `${apiInternal}/static/:path*` },
    ];
  },
};

export default nextConfig;
