/**
 * Per-request correlation IDs for audit + plugin-mirror tracing.
 *
 * Reads the inbound `x-request-id` header when the caller (proxy, mod,
 * panel UI) supplied one; generates a fresh UUID v4 when they didn't.
 * Every mutating route embeds the resulting id into `audit.payload._rid`
 * and echoes it back on the response so a 502 chain can be traced
 * end-to-end without grepping timestamps.
 */
export function getRequestId(req: Request): string {
  const h = req.headers.get('x-request-id');
  // Light validation so a malicious caller can't stuff a multi-MB
  // string into the audit row.
  if (h && h.length > 0 && h.length <= 128) return h;
  return generateUuidV4();
}

/**
 * Best-effort UUID v4. Uses `crypto.randomUUID()` when present (Node
 * 19+, Edge runtime, modern browsers); falls back to a `Math.random`
 * shape on the off chance we're on an ancient runtime.
 */
function generateUuidV4(): string {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === 'function') return g.randomUUID();
  // Fallback: not cryptographically strong but unique enough for
  // log-correlation purposes.
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

/** Standard response header so the caller can re-use the id on retries. */
export function withRequestId(headers: HeadersInit, rid: string): HeadersInit {
  if (headers instanceof Headers) {
    headers.set('x-request-id', rid);
    return headers;
  }
  return { ...(headers as Record<string, string>), 'x-request-id': rid };
}
