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
