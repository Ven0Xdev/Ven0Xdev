import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, every render() in a test file stays mounted to the jsdom
// document for the rest of that file — a later test can "pass" by finding
// an element a previous render left behind, not one it actually produced.
afterEach(() => {
  cleanup();
});
