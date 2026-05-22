/** Same-origin in production (Next rewrites); full URL in local dev. */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return '';
  }
  return process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
}
