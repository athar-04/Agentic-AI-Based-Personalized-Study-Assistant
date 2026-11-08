"use client";

import * as React from "react";
import { animate, motion, useInView, useReducedMotion, type Variants } from "framer-motion";

// One rhythm for the whole app: a soft ease-out for entrances, a spring for touch feedback.
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const SPRING = { type: "spring", stiffness: 340, damping: 26 } as const;

export function FadeIn({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** Staggered entrance for a group of cards. Children should be <StaggerItem>. */
export function Stagger({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ul" | "section" }) {
  const Comp = motion[as];
  return (
    <Comp className={className} variants={container} initial="hidden" animate="show">
      {children}
    </Comp>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const Comp = motion[as];
  return (
    <Comp className={className} variants={item}>
      {children}
    </Comp>
  );
}

/** Gentle lift on hover/press for cards that are themselves interactive. */
export function HoverLift({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ y: -4 }} whileTap={{ scale: 0.985 }} transition={SPRING}>
      {children}
    </motion.div>
  );
}

/**
 * Counts up to a value when it scrolls into view. Screen readers get the final value straight
 * away (the animated text is aria-hidden), and reduced motion shows it without counting.
 */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(reduced ? value : 0);
  // Later updates (e.g. live refreshes) glide from the current figure instead of restarting at 0.
  const from = React.useRef(0);

  React.useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    if (!inView) return;
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: (n) => {
        from.current = n;
        setShown(n);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduced]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular-nums">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Cross-fades page content when the route changes. */
export function PageTransition({ children, routeKey }: { children: React.ReactNode; routeKey: string }) {
  return (
    <motion.div key={routeKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}
