import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { UTCTimestamp } from "lightweight-charts";
import type { ChartDrawingRecord } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  chartDrawings: vi.fn(),
  createChartDrawing: vi.fn(),
  updateChartDrawing: vi.fn(),
  deleteChartDrawing: vi.fn(),
  deleteAllChartDrawings: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { useDrawings } from "./useDrawings";

const T = (n: number) => n as UTCTimestamp;
const identity = (t: UTCTimestamp) => t as number;
const priceIdentity = (p: number) => p;

function record(id: number): ChartDrawingRecord {
  return {
    id, ticker_symbol: "AAPL", timeframe: "1D", drawing_type: "hline",
    data: { type: "hline", price: 150, style: { color: "#2563eb", width: 2, opacity: 1, dash: "solid" } },
    locked: false, hidden: false, created_at: "2026-08-19T00:00:00Z", updated_at: "2026-08-19T00:00:00Z",
  };
}

describe("useDrawings", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("loads persisted drawings for the (symbol, timeframe) scope on mount", async () => {
    apiMock.chartDrawings.mockResolvedValue([record(1)]);
    const { result } = renderHook(() => useDrawings("AAPL", "1D", true));

    await waitFor(() => expect(result.current.drawings).toHaveLength(1));
    expect(apiMock.chartDrawings).toHaveBeenCalledWith("AAPL", "1D");
    expect(result.current.drawings[0].serverId).toBe(1);
    expect(result.current.drawings[0].payload.type).toBe("hline");
  });

  it("never fetches when disabled, and starts with an empty board", async () => {
    const { result } = renderHook(() => useDrawings("AAPL", "1D", false));
    expect(result.current.drawings).toEqual([]);
    expect(apiMock.chartDrawings).not.toHaveBeenCalled();
  });

  it("placing a one-click tool (hline) adds it optimistically then persists it", async () => {
    apiMock.chartDrawings.mockResolvedValue([]);
    apiMock.createChartDrawing.mockResolvedValue({ ...record(7), drawing_type: "hline" });
    const { result } = renderHook(() => useDrawings("AAPL", "1D", true));
    await waitFor(() => expect(apiMock.chartDrawings).toHaveBeenCalled());

    act(() => result.current.setTool("hline"));
    act(() => {
      result.current.handleClick({ time: T(100), price: 150 }, { x: 10, y: 10 }, identity, priceIdentity);
    });

    expect(result.current.drawings).toHaveLength(1);
    expect(result.current.drawings[0].serverId).toBeNull(); // optimistic, before the create call resolves
    expect(result.current.tool).toBe("cursor"); // one-click tools return to cursor immediately

    await waitFor(() => expect(result.current.drawings[0].serverId).toBe(7));
    expect(apiMock.createChartDrawing).toHaveBeenCalledWith(
      expect.objectContaining({ ticker_symbol: "AAPL", timeframe: "1D", drawing_type: "hline" }),
    );
  });

  it("a two-click tool (trendline) requires a pending first point before it adds anything", async () => {
    apiMock.chartDrawings.mockResolvedValue([]);
    apiMock.createChartDrawing.mockResolvedValue(record(9));
    const { result } = renderHook(() => useDrawings("AAPL", "1D", true));
    await waitFor(() => expect(apiMock.chartDrawings).toHaveBeenCalled());

    act(() => result.current.setTool("trendline"));
    act(() => {
      result.current.handleClick({ time: T(0), price: 100 }, { x: 0, y: 0 }, identity, priceIdentity);
    });
    expect(result.current.drawings).toHaveLength(0);
    expect(result.current.hasPendingFirstPoint()).toBe(true);

    act(() => {
      result.current.handleClick({ time: T(10), price: 110 }, { x: 10, y: 10 }, identity, priceIdentity);
    });
    expect(result.current.drawings).toHaveLength(1);
    expect(result.current.hasPendingFirstPoint()).toBe(false);
  });

  it("undo removes the last change and redo restores it", async () => {
    apiMock.chartDrawings.mockResolvedValue([]);
    apiMock.createChartDrawing.mockResolvedValue(record(1));
    const { result } = renderHook(() => useDrawings("AAPL", "1D", true));
    await waitFor(() => expect(apiMock.chartDrawings).toHaveBeenCalled());

    act(() => result.current.setTool("hline"));
    act(() => {
      result.current.handleClick({ time: T(0), price: 100 }, { x: 0, y: 0 }, identity, priceIdentity);
    });
    expect(result.current.drawings).toHaveLength(1);

    act(() => result.current.undo());
    expect(result.current.drawings).toHaveLength(0);

    act(() => result.current.redo());
    expect(result.current.drawings).toHaveLength(1);
  });

  it("deleteAll clears the board locally and calls the scoped bulk-delete endpoint", async () => {
    apiMock.chartDrawings.mockResolvedValue([record(1), record(2)]);
    apiMock.deleteAllChartDrawings.mockResolvedValue({ deleted: 2 });
    const { result } = renderHook(() => useDrawings("AAPL", "1D", true));
    await waitFor(() => expect(result.current.drawings).toHaveLength(2));

    act(() => result.current.deleteAll());
    expect(result.current.drawings).toHaveLength(0);
    expect(apiMock.deleteAllChartDrawings).toHaveBeenCalledWith("AAPL", "1D");
  });

  it("a locked drawing cannot be grabbed by beginDrag", async () => {
    apiMock.chartDrawings.mockResolvedValue([{ ...record(1), locked: true }]);
    const { result } = renderHook(() => useDrawings("AAPL", "1D", true));
    await waitFor(() => expect(result.current.drawings).toHaveLength(1));

    act(() => result.current.setSelectedId(result.current.drawings[0].localId));
    let started = false;
    act(() => {
      started = result.current.beginDrag({ x: 0, y: 150 }, identity, priceIdentity);
    });
    expect(started).toBe(false);
  });
});
