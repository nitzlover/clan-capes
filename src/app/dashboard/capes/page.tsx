'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Capes was folded into the unified clan hub — every clan's cape now lives in
 * its row on /dashboard/clans (Cape tab). This stub redirects old links there.
 * Client-side replace: a server redirect() got statically prerendered and
 * served as a 200 on the Node host, so it never fired.
 */
export default function CapesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/clans');
  }, [router]);
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
      Capes moved into Clans — redirecting…
    </p>
  );
}
