'use client';

/**
 * Motion toolkit — subtle, operator-grade, strictly B&W.
 *
 * Every primitive here animates transform + opacity ONLY (never layout-
 * affecting props) and every one bows out to `prefers-reduced-motion`:
 * when the user asks for less motion we render the final state with no
 * transition. The vocabulary is deliberately quiet — short fades, a
 * gentle upward drift, a soft stagger — matching the editorial admin
 * tone rather than a marketing splash.
 */

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Shared easing — calm decel curve used across the toolkit. */
const EASE = [0.2, 0.7, 0.2, 1] as const;

/* ───────────────────────────── Reveal ───────────────────────────── */

/**
 * Fade + drift-up on mount. Drop around any block that should enter
 * rather than snap in. `delay` lets a caller hand-sequence a couple of
 * siblings without reaching for <Stagger>.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 12,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ──────────────────────────── Stagger ───────────────────────────── */

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/**
 * Container that cascades its <StaggerItem> children in. Pass through
 * the same className you'd put on the wrapping grid/flex/ul so the
 * layout is unchanged — only the entrance is sequenced.
 */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

/** One cell of a <Stagger>. Renders a plain div under reduced motion. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/* ──────────────────────────── CountUp ───────────────────────────── */

/**
 * Tick a number from 0 → value with an ease-out so KPI cards feel
 * alive on load and on every refresh. `pad` zero-pads small values to
 * match the dashboard's `padStart(2,'0')` convention; pass 0 to skip.
 * Reduced motion renders the final number immediately.
 */
export function CountUp({
  value,
  duration = 0.9,
  pad = 0,
}: {
  value: number;
  duration?: number;
  pad?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const startVal = 0;
    let startTs: number | null = null;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / (duration * 1000));
      setDisplay(Math.round(startVal + (value - startVal) * easeOutCubic(t)));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, reduce]);

  const text = pad > 0 ? String(display).padStart(pad, '0') : String(display);
  return <>{text}</>;
}

/* ───────────────────────── PageTransition ───────────────────────── */

/**
 * Cross-fade dashboard routes. Keyed on pathname so navigating swaps the
 * page with a short fade + drift instead of a hard cut. `mode="wait"`
 * lets the outgoing page finish leaving before the next arrives, which
 * reads cleaner than an overlap on a content swap.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
