import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  it("shows the classified title/hint for a provider-unavailable error, never a generic message", () => {
    render(<ErrorState error={new ApiError("provider_unavailable", 503, "HTTP 302", "/x")} />);
    expect(screen.getByText("Market data is currently unavailable.")).toBeTruthy();
    expect(screen.getByText(/providers\/health/)).toBeTruthy();
  });

  it("distinguishes a backend-unreachable error from a provider-unavailable one", () => {
    render(<ErrorState error={new ApiError("backend_unreachable", 0, "fetch failed", "/x")} />);
    expect(screen.getByText("Could not reach the backend API.")).toBeTruthy();
  });

  it("renders no Retry button when onRetry is omitted", () => {
    render(<ErrorState error={new ApiError("backend_error", 500, "boom", "/x")} />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("calls onRetry exactly once when the Retry button is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState error={new ApiError("timeout", 0, "no response", "/x")} onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
