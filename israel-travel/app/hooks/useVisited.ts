"use client";
import { useState, useEffect, useCallback } from "react";

export function useVisited() {
  const [visited, setVisited] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem("israel-travel-visited");
      if (stored) setVisited(new Set(JSON.parse(stored)));
    } catch {
      // ignore
    }
  }, []);

  const toggleVisited = useCallback((id: string) => {
    setVisited((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(
        "israel-travel-visited",
        JSON.stringify(Array.from(next))
      );
      return next;
    });
  }, []);

  return { visited, toggleVisited };
}
