import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { NewsPipelineArticle } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  newsForSymbol: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { NewsPanel } from "./NewsPanel";

const ARTICLE: NewsPipelineArticle = {
  id: 1, provider: "alpaca", external_id: "12345", source: "Reuters",
  headline: "AAPL beats earnings estimates", summary: "Strong quarter.",
  url: "https://example.com/a", symbols: ["AAPL"],
  published_at: "2026-08-18T13:30:00Z", received_at: "2026-08-18T13:31:00Z",
  update_count: 0, sentiment: 0.6, sentiment_label: "positive",
  novelty: 1.0, relevance: 1.0, reliability: 0.9, impact: 0.7,
  category: "earnings", is_press_release: false, is_promotional: false,
};

describe("NewsPanel", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("shows an empty state when there are no articles yet", async () => {
    apiMock.newsForSymbol.mockResolvedValue({ symbol: "AAPL", count: 0, articles: [] });
    render(<NewsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText(/No news articles for AAPL yet/)).toBeTruthy());
  });

  it("renders an article's headline, sentiment, category and source", async () => {
    apiMock.newsForSymbol.mockResolvedValue({ symbol: "AAPL", count: 1, articles: [ARTICLE] });
    render(<NewsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText("AAPL beats earnings estimates")).toBeTruthy());
    expect(screen.getByText("Positive")).toBeTruthy();
    expect(screen.getByText("earnings")).toBeTruthy();
    expect(screen.getByText(/Reuters/)).toBeTruthy();
  });

  it("links the headline to the original article URL", async () => {
    apiMock.newsForSymbol.mockResolvedValue({ symbol: "AAPL", count: 1, articles: [ARTICLE] });
    render(<NewsPanel symbol="AAPL" />);

    const link = await screen.findByText("AAPL beats earnings estimates");
    expect(link.closest("a")?.getAttribute("href")).toBe("https://example.com/a");
  });

  it("shows an update-count badge for a republished article", async () => {
    apiMock.newsForSymbol.mockResolvedValue({ symbol: "AAPL", count: 1, articles: [{ ...ARTICLE, update_count: 2 }] });
    render(<NewsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText(/updated 2×/)).toBeTruthy());
  });

  it("surfaces a fetch error without crashing", async () => {
    apiMock.newsForSymbol.mockRejectedValue(new Error("network down"));
    render(<NewsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText("network down")).toBeTruthy());
  });
});
