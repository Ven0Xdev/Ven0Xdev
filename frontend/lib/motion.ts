"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Single source of truth for "should this render skip/shorten motion?" —
 * mirrors the CSS `prefers-reduced-motion` query so JS-driven animation
 * (rAF tweens, staged reveals) degrades the same way the CSS in
 * globals.css already does, instead of only half-respecting the setting. */
export function useReducedMotion(): boolean {
  // Starts false (matches SSR, which has no media-query signal at all —
  // same reasoning as ThemeToggle.tsx's pre-hydration placeholder) and is
  // corrected in a microtask right after mount, so this reads as syncing
  // from an external system in a callback rather than a synchronous
  // effect-body setState.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    Promise.resolve().then(() => setReduced(mq.matches));
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Pure so it's unit-testable without mounting anything: given the previous
 * and next value of a metric, decide whether this is a genuine, displayable
 * change and which direction it moved. Never fabricates a direction for an
 * unchanged or not-yet-known value. */
export function computeFlash(prev: number | null, next: number): "up" | "down" | null {
  if (prev === null || !Number.isFinite(prev) || !Number.isFinite(next)) return null;
  if (next > prev) return "up";
  if (next < prev) return "down";
  return null;
}

/** Tracks a numeric value across renders and reports a brief "up"/"down"
 * flash exactly when it genuinely changed from its own last real value —
 * never a synthetic/simulated delta. The flash clears itself after
 * `holdMs` so the caller can key a CSS pulse class off it. */
export function useFlashOnChange(value: number, holdMs = 900): "up" | "down" | null {
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const direction = computeFlash(prevRef.current, value);
    prevRef.current = value;
    if (!direction || reduced) return;
    setFlash(direction);
    const t = setTimeout(() => setFlash(null), holdMs);
    return () => clearTimeout(t);
  }, [value, holdMs, reduced]);

  return flash;
}

/** rAF-driven tween from the previously rendered value to `value`. First
 * mount always snaps instantly (there is no prior real value to animate
 * from — animating "up from zero" on load would misrepresent a static
 * number as freshly-changed). Reduced motion always snaps. */
export function useCountUp(value: number, durationMs = 500): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const mountedRef = useRef(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (reduced || from === value || !Number.isFinite(from) || !Number.isFinite(value)) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic — matches the app's --ease-out motion token in feel
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, reduced]);

  return display;
}

/** IntersectionObserver-backed "has this element been scrolled into view
 * yet" flag, for triggering stagger-reveal animations on content below the
 * fold instead of firing every entrance animation at once on page load. */
export function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const opts = useMemo(() => options, [options]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      Promise.resolve().then(() => setInView(true)); // no observer support — never hide content forever
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, opts ?? { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [opts]);

  return { ref, inView };
}
