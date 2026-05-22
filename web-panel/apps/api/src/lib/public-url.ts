/** Public CDN base for cape PNG URLs returned to Minecraft clients. */
export function getCdnPublicUrl(): string {
  const explicit = process.env.CDN_PUBLIC_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    return `https://${railway}/static/capes`;
  }

  const port = process.env.PORT ?? '3001';
  return `http://localhost:${port}/static/capes`;
}
