import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, every render() in a test file stays mounted to the jsdom
// document for the rest of that file — a later test can "pass" by finding
// an element a previous render left behind, not one it actually produced.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement Element.scrollTo (real browsers all do) — a
// no-op stub so components that scroll a container into view on new
// content (e.g. ChatWidget) don't throw in tests. Real scroll behavior is
// never something a jsdom-based test can meaningfully assert anyway.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom doesn't implement window.matchMedia either — lib/motion.ts's
// usePrefersReducedMotion (used by AnimatedNumber/StatTile, among others)
// calls it unconditionally on mount. A stub that always reports "no
// preference" and never fires change events is the honest default for a
// test environment with no real display settings.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}
