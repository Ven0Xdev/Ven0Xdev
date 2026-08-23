import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMetadata, UniverseAsset } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  chatHistory: vi.fn(),
  sendChatMessage: vi.fn(),
  clearChatSessionTicker: vi.fn(),
  assetUniverse: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { ChatWidget } from "./ChatWidget";

const AAPL: UniverseAsset = {
  symbol: "AAPL", asset_type: "STOCK", name: "Apple Inc.", exchange: "NASDAQ", currency: "USD",
  provider: "alpaca", is_active: true, tradable: true, trading_hours: "09:30-16:00 ET",
  data_delay: "realtime", supported_timeframes: ["1d"],
};
const MSFT: UniverseAsset = { ...AAPL, symbol: "MSFT", name: "Microsoft Corporation" };

const TEMPLATE_METADATA: ChatMetadata = {
  backend: "template", model: null, data_source: "alpaca", data_mode: "live", engine_mode: "HEURISTIC",
  as_of: "2026-08-18T12:00:00Z", safe_mode_active: false, drift_status: "stable", confidence_score: 72,
  confidence_note: "Confidence reflects model agreement, data quality, and liquidity.",
};

const LLM_METADATA: ChatMetadata = { ...TEMPLATE_METADATA, backend: "llm", model: "claude-sonnet-5" };

function emptyHistory(ticker: string | null = null) {
  return { session_key: "s", ticker, messages: [] };
}

describe("ChatWidget", () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiMock.chatHistory.mockResolvedValue(emptyHistory());
    apiMock.assetUniverse.mockResolvedValue([AAPL, MSFT]);
    apiMock.sendChatMessage.mockResolvedValue({ reply: "ok", ticker: null, session_key: "s", metadata: TEMPLATE_METADATA });
    apiMock.clearChatSessionTicker.mockResolvedValue({ session_key: "s", ticker: null });
  });

  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("quick-question buttons are disabled with an inline instruction until a ticker is selected", async () => {
    render(<ChatWidget />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Should I buy this?" })).toBeTruthy());

    expect((screen.getByRole("button", { name: "Should I buy this?" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Select a ticker above to enable quick questions/)).toBeTruthy();
    expect(apiMock.sendChatMessage).not.toHaveBeenCalled();
  });

  it("selecting a ticker via the searchable picker enables quick questions and shows a context chip", async () => {
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.click(screen.getByRole("button", { name: "Select a ticker" }));
    await user.type(screen.getByRole("combobox"), "Apple");
    await waitFor(() => expect(screen.getByRole("option", { name: /AAPL/ })).toBeTruthy());
    await user.click(screen.getByRole("option", { name: /AAPL/ }));

    expect(screen.getByText("$AAPL")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Should I buy this?" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/Select a ticker above to enable quick questions/)).toBeNull();
  });

  it("clicking a quick-question button sends exactly one message grounded on the selected ticker", async () => {
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.click(screen.getByRole("button", { name: "Select a ticker" }));
    await user.type(screen.getByRole("combobox"), "AAPL");
    await user.click(await screen.findByRole("option", { name: /AAPL/ }));

    await user.click(screen.getByRole("button", { name: "How confident are you?" }));

    await waitFor(() => expect(apiMock.sendChatMessage).toHaveBeenCalledTimes(1));
    expect(apiMock.sendChatMessage).toHaveBeenCalledWith(expect.any(String), "How confident are you?", "AAPL");
  });

  it("detects a $AAPL cashtag typed directly and grounds subsequent replies on it", async () => {
    apiMock.sendChatMessage.mockResolvedValue({ reply: "AAPL outlook...", ticker: "AAPL", session_key: "s", metadata: TEMPLATE_METADATA });
    const user = userEvent.setup();
    render(<ChatWidget />);

    await waitFor(() => expect(screen.getByPlaceholderText(/Ask about any ticker/)).toBeTruthy());
    await user.type(screen.getByPlaceholderText(/Ask about any ticker/), "$AAPL what do you think?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("$AAPL")).toBeTruthy());
  });

  it("an unsupported symbol reply never sets or changes the context chip", async () => {
    apiMock.sendChatMessage.mockResolvedValue({
      reply: "'ZZZZZZ' isn't in Nexora's supported asset universe.",
      ticker: null,
      session_key: "s",
      metadata: TEMPLATE_METADATA,
    });
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.type(screen.getByPlaceholderText(/Ask about any ticker/), "$ZZZZZZ thoughts?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/isn't in Nexora's supported asset universe/)).toBeTruthy());
    expect(screen.queryByText("$ZZZZZZ")).toBeNull();
    expect(screen.getByText(/Select a ticker above to enable quick questions/)).toBeTruthy();
  });

  it("context persists across turns: the chip stays after a follow-up reply with no new ticker mention", async () => {
    apiMock.sendChatMessage
      .mockResolvedValueOnce({ reply: "first", ticker: "AAPL", session_key: "s", metadata: TEMPLATE_METADATA })
      .mockResolvedValueOnce({ reply: "second", ticker: null, session_key: "s", metadata: TEMPLATE_METADATA });
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.type(screen.getByPlaceholderText(/Ask about any ticker/), "$AAPL should I buy?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("$AAPL")).toBeTruthy());

    await user.type(screen.getByPlaceholderText(/Ask about AAPL/), "how confident are you?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(apiMock.sendChatMessage).toHaveBeenCalledTimes(2));
    expect(apiMock.sendChatMessage).toHaveBeenLastCalledWith(expect.any(String), "how confident are you?", "AAPL");
    expect(screen.getByText("$AAPL")).toBeTruthy();
  });

  it("context persists across a page reload via the session's own remembered ticker", async () => {
    apiMock.chatHistory.mockResolvedValue({
      session_key: "s", ticker: "MSFT",
      messages: [{ role: "user", content: "$MSFT outlook?", metadata: null }, { role: "assistant", content: "...", metadata: TEMPLATE_METADATA }],
    });
    render(<ChatWidget />);

    await waitFor(() => expect(screen.getByText("$MSFT")).toBeTruthy());
  });

  it("opening from a stock page carries that ticker in immediately, without waiting for history", async () => {
    apiMock.chatHistory.mockResolvedValue(emptyHistory());
    render(<ChatWidget initialTicker="AAPL" />);

    expect(screen.getByText("$AAPL")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Should I buy this?" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("removing the context chip clears it locally and clears the session server-side", async () => {
    const user = userEvent.setup();
    render(<ChatWidget initialTicker="AAPL" />);
    await waitFor(() => expect(screen.getByText("$AAPL")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Remove AAPL from chat context" }));

    expect(screen.queryByText("$AAPL")).toBeNull();
    expect(screen.getByText(/Select a ticker above to enable quick questions/)).toBeTruthy();
    await waitFor(() => expect(apiMock.clearChatSessionTicker).toHaveBeenCalledWith(expect.any(String)));
  });

  it("clearly labels a template-mode reply as not an LLM", async () => {
    apiMock.sendChatMessage.mockResolvedValue({ reply: "template reply", ticker: null, session_key: "s", metadata: TEMPLATE_METADATA });
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.type(screen.getByPlaceholderText(/Ask about any ticker/), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Template mode (no external AI)")).toBeTruthy());
    expect(screen.queryByText(/^LLM answer/)).toBeNull();
  });

  it("clearly labels an LLM-backend reply, distinct from template mode", async () => {
    apiMock.sendChatMessage.mockResolvedValue({ reply: "llm reply", ticker: null, session_key: "s", metadata: LLM_METADATA });
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.type(screen.getByPlaceholderText(/Ask about any ticker/), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("LLM answer (claude-sonnet-5)")).toBeTruthy());
    expect(screen.queryByText("Template mode (no external AI)")).toBeNull();
  });

  it("shows provider, drift, and confidence-limitation metadata alongside a grounded reply", async () => {
    apiMock.sendChatMessage.mockResolvedValue({ reply: "grounded reply", ticker: "AAPL", session_key: "s", metadata: TEMPLATE_METADATA });
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.type(screen.getByPlaceholderText(/Ask about any ticker/), "$AAPL outlook?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/source: alpaca/)).toBeTruthy());
    expect(screen.getByText("heuristic engine")).toBeTruthy();
    expect(screen.getByText("drift: stable")).toBeTruthy();
    expect(screen.getByText("confidence 72/100")).toBeTruthy();
  });

  it("the ticker picker only ever offers active canonical assets, never an arbitrary typed symbol", async () => {
    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.click(screen.getByRole("button", { name: "Select a ticker" }));
    await user.type(screen.getByRole("combobox"), "ZZZZZZ");

    await waitFor(() => expect(screen.getByText(/No canonical ticker matches/)).toBeTruthy());
    expect(screen.queryByRole("option")).toBeNull();
  });
});
