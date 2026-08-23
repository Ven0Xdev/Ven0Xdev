import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock(),
}));

const apiMock = vi.hoisted(() => ({
  chatHistory: vi.fn(),
  sendChatMessage: vi.fn(),
  clearChatSessionTicker: vi.fn(),
  assetUniverse: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import ChatPage from "./page";

describe("ChatPage", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it("never mentions the legacy OTC example ticker, and uses AAPL instead", async () => {
    apiMock.chatHistory.mockResolvedValue({ session_key: "s", ticker: null, messages: [] });
    render(<ChatPage />);

    await waitFor(() => expect(screen.getAllByText(/what about Apple/).length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toContain("AXNT");
  });

  it("carries a ?ticker= query param into the chat as an uppercased context chip", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("ticker=aapl"));
    apiMock.chatHistory.mockResolvedValue({ session_key: "s", ticker: null, messages: [] });
    render(<ChatPage />);

    await waitFor(() => expect(screen.getByText("$AAPL")).toBeTruthy());
  });

  it("with no ticker param, quick questions start disabled with the inline instruction", async () => {
    apiMock.chatHistory.mockResolvedValue({ session_key: "s", ticker: null, messages: [] });
    render(<ChatPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Should I buy this?" })).toBeTruthy());
    expect((screen.getByRole("button", { name: "Should I buy this?" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Select a ticker above to enable quick questions/)).toBeTruthy();
  });
});
