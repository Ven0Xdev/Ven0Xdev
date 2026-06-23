"use client";
import { MapPin } from "lucide-react";

interface HeaderProps {
  total: number;
  visited: number;
}

export default function Header({ total, visited }: HeaderProps) {
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  return (
    <header
      className="glass sticky top-0 z-40"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #c9a84c, #a07830)" }}
          >
            <MapPin size={14} strokeWidth={2.5} style={{ color: "#060d1a" }} />
          </div>
          <span
            className="font-display text-lg font-bold tracking-tight"
            style={{ color: "#f0ece4", fontFamily: "var(--font-heading)" }}
          >
            Eretz<span style={{ color: "#c9a84c" }}>·</span>IL
          </span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm" style={{ color: "rgba(240,236,228,0.55)" }}>
            <span style={{ color: "#7de09a", fontWeight: 600 }}>{visited}</span>
            <span>/</span>
            <span>{total}</span>
            <span>visited</span>
            <span style={{ color: "rgba(201,168,76,0.7)" }}>({pct}%)</span>
          </div>
          <div
            className="w-32 h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #c9a84c, #7de09a)",
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
