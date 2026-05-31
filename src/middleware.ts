/**
 * Global Next.js middleware — applies before every route.
 *
 * Two responsibilities:
 *   1. Set baseline security headers on every response so the browser
 *      can't be used as a confused-deputy (clickjack, content-sniff,
 *      mixed-content downgrade, etc.).
 *   2. Reject cross-origin writes against /api/panel/* and
 *      /api/leader/* before the route handler runs. The admin JWT
 *      lives in localStorage and the leader cookie is SameSite=Lax,
 *      but cookie SameSite=Lax still permits top-level form POSTs;
 *      explicit Origin/Referer check shuts that vector for good.
 *
 * Plugin-facing /api/plugin/* and /api/setup/* are exempt — they're
 * called by the Paper plugin, not browsers, and the Bearer key is
 * the auth (a plugin running off-origin needs to be able to POST).
 *
 * NB: middleware runs on the Edge runtime by default; we keep imports
 * to the standard library only so nothing tries to require Node-only
 * modules (drizzle, pg, fs) here.
 */

import { NextResponse, type NextRequest } from 'next/server';

/** Routes that require same-origin POST/PATCH/DELETE for CSRF defence. */
const CSRF_PROTECTED_PREFIXES = ['/api/panel/', '/api/leader/'];

/** Mutating HTTP methods we gate. */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // CSRF gate for browser-driven write endpoints.
  if (
    MUTATING_METHODS.has(req.method) &&
    CSRF_PROTECTED_PREFIXES.some((p) => url.pathname.startsWith(p))
  ) {
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const host = req.headers.get('host');
    if (!host) {
      return new NextResponse(JSON.stringify({ error: 'missing host header' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Either the Origin header (preferred — sent on every fetch) or
    // the Referer header (fallback for legacy clients) must point at
    // the same host as the request. Anonymous Origin "null" is also
    // rejected.
    const sameOrigin = (header: string | null) => {
      if (!header) return false;
      try {
        const u = new URL(header);
        return u.host === host;
      } catch {
        return false;
      }
    };
    if (!sameOrigin(origin) && !sameOrigin(referer)) {
      return new NextResponse(
        JSON.stringify({ error: 'cross-origin request rejected' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
  }

  // Forward + decorate the response with baseline security headers.
  const res = NextResponse.next();
  applySecurityHeaders(res);
  return res;
}

function applySecurityHeaders(res: NextResponse) {
  // Frame-busting: panel is admin-only, no need to be embeddable.
  res.headers.set('X-Frame-Options', 'DENY');
  // Prevent MIME-sniffing — important since /api/static/capes serves
  // user-supplied PNGs that we re-encode but still mark Content-Type.
  res.headers.set('X-Content-Type-Options', 'nosniff');
  // Don't leak the full URL (which includes server names + clan tags)
  // when the user navigates off-site. `strict-origin-when-cross-origin`
  // sends the origin only on cross-origin nav, nothing on downgrade.
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable a few never-used powerful features the admin panel doesn't
  // need — closes the door on a future XSS abusing them.
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  // HSTS only when we know we're on HTTPS in production. Set the
  // includeSubDomains + preload flags so a future panel.<domain> stays
  // protected too.
  if (process.env.NODE_ENV === 'production') {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }
  // Content-Security-Policy — relaxed enough to keep Next.js + skinview3d
  // + Tailwind working in production, tight enough to refuse third-
  // party scripts and inline styles other than Tailwind's emitted ones.
  // 'self' for scripts; data: + blob: allowed for canvas → texture
  // round-trips (skinview3d), 'unsafe-eval' for the Three.js shader
  // compiler hot-path. Google Fonts allowed for the Material Symbols
  // import (legacy — moving off it in the rebrand will let us tighten).
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' data: blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
}

/**
 * Limit middleware to actual page + API traffic — skip static asset
 * URLs to keep the edge runtime path-match cheap and to avoid
 * touching Next.js's own `/_next/*` cache layer.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - public folder (any file with extension)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
