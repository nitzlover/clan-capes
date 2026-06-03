/**
 * Skeleton primitives — B&W shimmer placeholders that hold a page's
 * real layout while data loads, so content fades in instead of popping
 * a grid into a one-line "Loading…" string. The sweep animation lives
 * in globals.css (`.skeleton`) and is disabled under reduced motion.
 *
 * Server-safe: no hooks, no client directive — these render inside both
 * server and client pages. Always `aria-hidden`; the surrounding region
 * carries the real loading semantics.
 */

export function Skeleton({
  className = '',
  rounded = 'md',
}: {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'pill';
}) {
  const radius =
    rounded === 'pill'
      ? 'var(--radius-pill)'
      : rounded === 'lg'
        ? 'var(--radius-lg)'
        : rounded === 'sm'
          ? 'var(--radius-sm)'
          : 'var(--radius-md)';
  return (
    <div className={`skeleton ${className}`} style={{ borderRadius: radius }} aria-hidden />
  );
}

/** A run of text-line bars; last line shortened for a natural ragged edge. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'h-3 w-2/3' : 'h-3'} rounded="sm" />
      ))}
    </div>
  );
}

/** Mirrors the Overview MetricCard footprint (tile + label + big number). */
export function SkeletonMetricCard() {
  return (
    <div className="brutal-card flex items-start gap-5 p-6" aria-hidden>
      <Skeleton className="h-12 w-12 shrink-0" rounded="md" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-2.5 w-16" rounded="sm" />
        <Skeleton className="mt-3 h-9 w-20" rounded="sm" />
        <Skeleton className="mt-3 h-2 w-24" rounded="sm" />
      </div>
    </div>
  );
}

/** A grid of metric-card skeletons matching the Overview 5-up layout. */
export function SkeletonMetricGrid({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMetricCard key={i} />
      ))}
    </div>
  );
}

/** Stack of list-row skeletons for table/roster pages. */
export function SkeletonRows({ rows = 6, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col ${className}`} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-6 border-t border-[var(--rule)] py-4 first:border-t-0"
        >
          <Skeleton className="h-9 w-9" rounded="md" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-40" rounded="sm" />
            <Skeleton className="h-2.5 w-24" rounded="sm" />
          </div>
          <Skeleton className="h-3 w-12" rounded="sm" />
        </div>
      ))}
    </div>
  );
}

/** A single card-shaped block — generic filler for panel bodies. */
export function SkeletonCard({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`brutal-card p-6 ${className}`} aria-hidden>
      {children ?? <SkeletonText lines={4} />}
    </div>
  );
}
