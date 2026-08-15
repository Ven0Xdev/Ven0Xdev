import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

const meMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api: { me: meMock, search: vi.fn() },
}));

import { SidebarBody } from "./Sidebar";

// Phase 11 added a client-side gate hiding the Admin nav item from
// non-operator accounts (server-side enforcement is the real security
// boundary — see api/deps.py's require_operator — this only avoids
// showing a link a regular user would just get a 403 from).
describe("SidebarBody — Admin nav visibility", () => {
  afterEach(() => {
    meMock.mockReset();
  });

  it("hides Admin for a regular user", async () => {
    meMock.mockResolvedValue({ id: 1, email: "u@example.com", role: "user", created_at: "" });
    render(<SidebarBody />);

    await waitFor(() => expect(meMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });

  it("shows Admin for an operator account", async () => {
    meMock.mockResolvedValue({ id: 1, email: "op@example.com", role: "operator", created_at: "" });
    render(<SidebarBody />);

    await waitFor(() => expect(screen.queryByRole("link", { name: "Admin" })).not.toBeNull());
  });

  it("hides Admin when the /auth/me call fails (e.g. logged out)", async () => {
    meMock.mockRejectedValue(new Error("401"));
    render(<SidebarBody />);

    await waitFor(() => expect(meMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });
});
