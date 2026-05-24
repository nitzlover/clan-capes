/**
 * Next config in plain JS so the runtime doesn't have to drag the
 * TypeScript compiler into the production image just to parse this
 * one-line config. With next.config.ts present Next.js auto-installs
 * typescript on startup (3+ seconds added to boot), which is pure
 * dead weight for a config that has no TypeScript surface.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
