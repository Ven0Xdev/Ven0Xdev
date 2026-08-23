"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import { api } from "@/lib/api";
import type {
  Anchor, Drawing, DrawingPayload, DrawingStyle, DrawingType,
} from "./types";
import { DEFAULT_FIB_LEVELS, DEFAULT_STYLE } from "./types";
import { hitTest, magnetSnap, toPixel, type PriceToCoord, type TimeToCoord } from "./geometry";

export type DrawTool = "cursor" | DrawingType;

const TWO_POINT_TYPES = new Set<DrawingType>(["trendline", "ray", "arrow", "rectangle", "fibonacci"]);

function localId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newPayload(type: DrawingType, p1: Anchor, p2: Anchor | null, style: DrawingStyle): DrawingPayload {
  switch (type) {
    case "trendline":
      return { type: "trendline", p1, p2: p2 ?? p1, style };
    case "ray":
      return { type: "ray", p1, p2: p2 ?? p1, style };
    case "arrow":
      return { type: "arrow", p1, p2: p2 ?? p1, style };
    case "rectangle":
      return { type: "rectangle", p1, p2: p2 ?? p1, style };
    case "fibonacci":
      return { type: "fibonacci", p1, p2: p2 ?? p1, levels: DEFAULT_FIB_LEVELS, style };
    case "hline":
      return { type: "hline", price: p1.price, style };
    case "vline":
      return { type: "vline", time: p1.time, style };
    case "text":
      return { type: "text", anchor: p1, text: "Note", style };
  }
}

/** Owns all chart-drawing state for one (symbol, timeframe): the
 * drawings themselves, the active tool, selection, undo/redo, and
 * backend persistence. TradingChart wires this to chart mouse events and
 * the DrawingToolbar; nothing here touches lightweight-charts directly
 * except through the pixel<->time/price converters it's handed. */
export function useDrawings(symbol: string, timeframe: string, enabled: boolean) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<DrawTool>("cursor");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [magnet, setMagnet] = useState(false);
  const [allLocked, setAllLocked] = useState(false);
  const [style, setStyle] = useState<DrawingStyle>(DEFAULT_STYLE);
  const pendingFirstPoint = useRef<Anchor | null>(null);
  const undoStack = useRef<Drawing[][]>([]);
  const redoStack = useRef<Drawing[][]>([]);
  const dragRef = useRef<{ id: string; handleIndex: number | null; startAnchors: Anchor[] } | null>(null);

  // Load persisted drawings for this scope; falls back to an empty board
  // (never fatal — a chart is fully usable with zero drawings).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .chartDrawings(symbol, timeframe)
      .then((rows) => {
        if (cancelled) return;
        setDrawings(
          rows.map((r) => ({
            localId: `server-${r.id}`, serverId: r.id, payload: r.data as DrawingPayload,
            locked: r.locked, hidden: r.hidden,
          })),
        );
      })
      .catch(() => !cancelled && setDrawings([]));
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, enabled]);

  const pushHistory = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-49), drawings];
    redoStack.current = [];
  }, [drawings]);

  const persist = useCallback(
    (drawing: Drawing) => {
      if (drawing.serverId !== null) {
        api.updateChartDrawing(drawing.serverId, {
          data: drawing.payload, locked: drawing.locked, hidden: drawing.hidden,
        }).catch(() => {});
      } else {
        api
          .createChartDrawing({
            ticker_symbol: symbol, timeframe, drawing_type: drawing.payload.type,
            data: drawing.payload, locked: drawing.locked, hidden: drawing.hidden,
          })
          .then((saved) => {
            setDrawings((prev) =>
              prev.map((d) => (d.localId === drawing.localId ? { ...d, serverId: saved.id } : d)),
            );
          })
          .catch(() => {});
      }
    },
    [symbol, timeframe],
  );

  const addDrawing = useCallback(
    (payload: DrawingPayload) => {
      pushHistory();
      const drawing: Drawing = { localId: localId(), serverId: null, payload, locked: false, hidden: false };
      setDrawings((prev) => [...prev, drawing]);
      persist(drawing);
      setSelectedId(drawing.localId);
    },
    [persist, pushHistory],
  );

  const updateDrawing = useCallback(
    (id: string, updater: (d: Drawing) => Drawing, { record = true }: { record?: boolean } = {}) => {
      if (record) pushHistory();
      setDrawings((prev) => {
        const next = prev.map((d) => (d.localId === id ? updater(d) : d));
        const changed = next.find((d) => d.localId === id);
        if (changed) persist(changed);
        return next;
      });
    },
    [persist, pushHistory],
  );

  const deleteDrawing = useCallback(
    (id: string) => {
      pushHistory();
      const target = drawings.find((d) => d.localId === id);
      setDrawings((prev) => prev.filter((d) => d.localId !== id));
      if (target?.serverId !== null && target) api.deleteChartDrawing(target.serverId!).catch(() => {});
      if (selectedId === id) setSelectedId(null);
    },
    [drawings, pushHistory, selectedId],
  );

  const deleteAll = useCallback(() => {
    pushHistory();
    setDrawings([]);
    setSelectedId(null);
    api.deleteAllChartDrawings(symbol, timeframe).catch(() => {});
  }, [pushHistory, symbol, timeframe]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current = [...redoStack.current, drawings];
    setDrawings(prev);
  }, [drawings]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current, drawings];
    setDrawings(next);
  }, [drawings]);

  const toggleLock = useCallback((id: string) => {
    updateDrawing(id, (d) => ({ ...d, locked: !d.locked }));
  }, [updateDrawing]);

  const toggleHidden = useCallback((id: string) => {
    updateDrawing(id, (d) => ({ ...d, hidden: !d.hidden }), { record: false });
  }, [updateDrawing]);

  const toggleLockAll = useCallback(() => {
    pushHistory();
    setAllLocked((prev) => {
      const next = !prev;
      setDrawings((ds) => {
        const updated = ds.map((d) => ({ ...d, locked: next }));
        updated.forEach(persist);
        return updated;
      });
      return next;
    });
  }, [persist, pushHistory]);

  // --- chart interaction -----------------------------------------------

  const applyMagnet = useCallback(
    (raw: Anchor, bars: { ts: string; open: number; high: number; low: number; close: number }[], toTime: (iso: string) => UTCTimestamp) =>
      magnet ? magnetSnap(raw, bars, toTime) : raw,
    [magnet],
  );

  /** Called on every chart click. Places a pending point for multi-click
   * tools, hit-tests for selection in cursor mode. Returns true if the
   * click was consumed (caller should not treat it as a pan/zoom-only
   * interaction). */
  const handleClick = useCallback(
    (anchor: Anchor, pixel: { x: number; y: number }, timeToCoord: TimeToCoord, priceToCoord: PriceToCoord): boolean => {
      if (tool === "cursor") {
        for (let i = drawings.length - 1; i >= 0; i--) {
          const d = drawings[i];
          if (d.hidden) continue;
          if (hitTest(d.payload, pixel, timeToCoord, priceToCoord)) {
            setSelectedId(d.localId);
            return true;
          }
        }
        setSelectedId(null);
        return false;
      }

      if (tool === "hline" || tool === "vline" || tool === "text") {
        addDrawing(newPayload(tool, anchor, null, style));
        setTool("cursor");
        return true;
      }

      if (TWO_POINT_TYPES.has(tool)) {
        if (pendingFirstPoint.current === null) {
          pendingFirstPoint.current = anchor;
          return true;
        }
        addDrawing(newPayload(tool, pendingFirstPoint.current, anchor, style));
        pendingFirstPoint.current = null;
        setTool("cursor");
        return true;
      }
      return false;
    },
    [addDrawing, drawings, style, tool],
  );

  const beginDrag = useCallback(
    (pixel: { x: number; y: number }, timeToCoord: TimeToCoord, priceToCoord: PriceToCoord): boolean => {
      if (tool !== "cursor" || selectedId === null) return false;
      const d = drawings.find((x) => x.localId === selectedId);
      if (!d || d.locked) return false;
      const anchorList = anchorsOfPayload(d.payload);
      let handleIndex: number | null = null;
      for (let i = 0; i < anchorList.length; i++) {
        const p = toPixel(anchorList[i], timeToCoord, priceToCoord);
        if (p && Math.hypot(p.x - pixel.x, p.y - pixel.y) <= 8) {
          handleIndex = i;
          break;
        }
      }
      if (handleIndex === null && !hitTest(d.payload, pixel, timeToCoord, priceToCoord)) return false;
      dragRef.current = { id: d.localId, handleIndex, startAnchors: anchorList };
      pushHistory();
      return true;
    },
    [drawings, pushHistory, selectedId, tool],
  );

  const dragTo = useCallback(
    (anchor: Anchor) => {
      const drag = dragRef.current;
      if (!drag) return;
      updateDrawing(drag.id, (d) => ({ ...d, payload: moveAnchors(d.payload, drag, anchor) }), { record: false });
    },
    [updateDrawing],
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    const id = dragRef.current.id;
    dragRef.current = null;
    const d = drawings.find((x) => x.localId === id);
    if (d) persist(d);
  }, [drawings, persist]);

  const selected = useMemo(() => drawings.find((d) => d.localId === selectedId) ?? null, [drawings, selectedId]);

  return {
    drawings, tool, setTool, selectedId, setSelectedId, selected, magnet, setMagnet, allLocked, toggleLockAll,
    style, setStyle, pendingFirstPoint, hasPendingFirstPoint: () => pendingFirstPoint.current !== null,
    cancelPending: () => {
      pendingFirstPoint.current = null;
    },
    handleClick, beginDrag, dragTo, endDrag, applyMagnet,
    addDrawing, updateDrawing, deleteDrawing, deleteAll, undo, redo,
    toggleLock, toggleHidden,
    canUndo: () => undoStack.current.length > 0,
    canRedo: () => redoStack.current.length > 0,
  };
}

function anchorsOfPayload(payload: DrawingPayload): Anchor[] {
  switch (payload.type) {
    case "trendline":
    case "ray":
    case "arrow":
    case "rectangle":
    case "fibonacci":
      return [payload.p1, payload.p2];
    case "text":
      return [payload.anchor];
    case "hline":
      return [{ time: 0 as UTCTimestamp, price: payload.price }];
    case "vline":
      return [{ time: payload.time, price: 0 }];
  }
}

function moveAnchors(
  payload: DrawingPayload, drag: { handleIndex: number | null; startAnchors: Anchor[] }, to: Anchor,
): DrawingPayload {
  const { handleIndex, startAnchors } = drag;
  const delta = handleIndex === null && startAnchors[0] ? { time: to.time - startAnchors[0].time, price: to.price - startAnchors[0].price } : null;

  const moveAnchor = (a: Anchor, index: number): Anchor => {
    if (handleIndex !== null) return index === handleIndex ? to : a;
    if (!delta) return a;
    return { time: (a.time + delta.time) as UTCTimestamp, price: a.price + delta.price };
  };

  switch (payload.type) {
    case "trendline":
    case "ray":
    case "arrow":
    case "rectangle":
    case "fibonacci":
      return { ...payload, p1: moveAnchor(payload.p1, 0), p2: moveAnchor(payload.p2, 1) };
    case "text":
      return { ...payload, anchor: moveAnchor(payload.anchor, 0) };
    case "hline":
      return { ...payload, price: to.price };
    case "vline":
      return { ...payload, time: to.time };
  }
}
