"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatMessage, ChatMetadata } from "@/lib/types";
import { TickerPicker } from "./TickerPicker";
import { LocalTime } from "@/components/ui/LocalTime";

function sessionKeyFor(ticker?: string) {
  if (typeof window === "undefined") return "server";
  const key = `ven0x-chat-session-${ticker ?? "general"}`;
  let stored = window.localStorage.getItem(key);
  if (!stored) {
    stored = `${key}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, stored);
  }
  return stored;
}

const SUGGESTIONS = [
  "Should I buy this?",
  "What are the biggest risks?",
  "How confident are you?",
  "What would invalidate this setup?",
  "What position size would you recommend?",
];

const DRIFT_LABELS: Record<ChatMetadata["drift_status"], string> = {
  insufficient_history: "drift: not enough history yet",
  stable: "drift: stable",
  moderate: "drift: moderate shift",
  significant: "drift: significant shift",
};

/** Provenance strip under every assistant reply — market-data provider,
 * timestamp, model mode, drift/safe-mode status, and confidence
 * limitations, per the platform's standing "never let the user mistake a
 * probability for a guarantee, or a template reply for an LLM" rule. */
function MetadataFooter({ metadata }: { metadata?: ChatMetadata | null }) {
  if (!metadata) return null;
  const backendLabel = metadata.backend === "llm" ? `LLM answer${metadata.model ? ` (${metadata.model})` : ""}` : "Template mode (no external AI)";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span
        className="rounded px-1.5 py-0.5 font-semibold tracking-wide"
        style={{
          color: metadata.backend === "llm" ? "var(--series-blue)" : "var(--text-secondary)",
          background: "color-mix(in srgb, currentColor 12%, transparent)",
        }}
        title={metadata.backend === "llm" ? "This reply came from an external LLM, grounded in live tool calls." : "This reply is deterministic — pattern-matched against live analysis, no external AI involved."}
      >
        {backendLabel}
      </span>
      {metadata.data_source && (
        <span className="rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)" }}>
          source: {metadata.data_source} ({metadata.data_mode})
        </span>
      )}
      {metadata.engine_mode && (
        <span className="rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)" }}>
          {metadata.engine_mode === "TRAINED_ML" ? "trained ML model" : "heuristic engine"}
        </span>
      )}
      {metadata.as_of && (
        <span className="rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)" }}>
          as of <LocalTime iso={metadata.as_of} options={{ style: "short" }} />
        </span>
      )}
      <span className="rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)" }}>
        {DRIFT_LABELS[metadata.drift_status]}
      </span>
      {metadata.safe_mode_active && (
        <span
          className="rounded px-1.5 py-0.5 font-semibold"
          style={{ color: "var(--status-warning)", background: "color-mix(in srgb, var(--status-warning) 14%, transparent)" }}
        >
          Safe Mode active
        </span>
      )}
      {metadata.confidence_score != null && (
        <span className="rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)" }} title={metadata.confidence_note}>
          confidence {metadata.confidence_score.toFixed(0)}/100
        </span>
      )}
    </div>
  );
}

export function ChatWidget({ initialTicker }: { initialTicker?: string }) {
  // Captured once at mount, alongside the session key it's paired with —
  // both describe how *this session* was opened, not the live prop (which
  // could keep changing if the parent re-renders with a different ticker
  // without remounting this widget; the session itself stays fixed either
  // way, so re-deriving these from a changing prop would desync from it).
  const [{ sessionKey, openedWithTicker }] = useState(() => ({
    sessionKey: sessionKeyFor(initialTicker),
    openedWithTicker: Boolean(initialTicker),
  }));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(initialTicker ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .chatHistory(sessionKey)
      .then((h) => {
        setMessages(h.messages as ChatMessage[]);
        // The server-remembered session ticker wins on reload unless this
        // widget was explicitly opened with one (e.g. from a stock page) —
        // that explicit context takes precedence over whatever a stale
        // session happened to be grounded on before.
        if (!openedWithTicker && h.ticker) setSelectedTicker(h.ticker);
      })
      .catch(() => setMessages([]));
  }, [sessionKey, openedWithTicker]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    try {
      const res = await api.sendChatMessage(sessionKey, text, selectedTicker ?? undefined);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, metadata: res.metadata }]);
      // Only adopt a newly-resolved ticker — a null response.ticker means
      // either "no ticker anywhere" or "an unsupported symbol was
      // mentioned", and in both cases the backend deliberately left
      // whatever was already in session context untouched (see
      // services/chat/assistant.py's unsupported-mention handling), so
      // the chip must not be cleared here either.
      if (res.ticker && res.ticker !== selectedTicker) setSelectedTicker(res.ticker);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error reaching assistant: ${String(e)}` }]);
    } finally {
      setSending(false);
    }
  };

  const removeTicker = () => {
    setSelectedTicker(null);
    api.clearChatSessionTicker(sessionKey).catch(() => {
      // Best-effort — the chip is already gone locally; a failed clear
      // just means a stale session might still remember the old ticker
      // server-side until the next successful clear or a new mention.
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {selectedTicker && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            ${selectedTicker}
            <button
              type="button"
              onClick={removeTicker}
              aria-label={`Remove ${selectedTicker} from chat context`}
              className="leading-none"
              style={{ color: "inherit" }}
            >
              ×
            </button>
          </span>
        )}
        <button type="button" onClick={() => setPickerOpen((v) => !v)} className="btn btn-ghost btn-sm text-xs">
          {selectedTicker ? "Change ticker" : "Select a ticker"}
        </button>
      </div>

      {pickerOpen && (
        <div className="mb-2">
          <TickerPicker
            onSelect={(symbol) => {
              setSelectedTicker(symbol);
              setPickerOpen(false);
            }}
          />
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Select a ticker, mention one directly ($AAPL, AAPL, or &quot;what about Apple?&quot;), or ask a general
            question. Ask about risk, catalysts, confidence, position sizing, or what would invalidate a setup.
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {messages.map((m, i) => (
            <div
              key={i}
              className="animate-in max-w-[92%]"
              style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start" }}
            >
              <div
                className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                style={{
                  background: m.role === "user" ? "var(--accent)" : "var(--surface-2)",
                  color: m.role === "user" ? "var(--text-on-accent)" : "var(--text-primary)",
                  borderBottomRightRadius: m.role === "user" ? 4 : undefined,
                  borderBottomLeftRadius: m.role === "assistant" ? 4 : undefined,
                }}
              >
                {m.content}
              </div>
              {m.role === "assistant" && <MetadataFooter metadata={m.metadata} />}
            </div>
          ))}
          {sending && (
            <div
              className="flex max-w-[92%] items-center gap-1.5 self-start rounded-2xl px-3.5 py-3"
              style={{ background: "var(--surface-2)", borderBottomLeftRadius: 4 }}
              aria-label="Assistant is thinking"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--text-muted)",
                    animation: `typing-bounce 1.1s ${i * 0.15}s ease-in-out infinite`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {!selectedTicker && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Select a ticker above to enable quick questions — or mention one directly in your message.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              disabled={!selectedTicker}
              onClick={() => send(s)}
              className="rounded-full px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-secondary)",
                transition: "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                if (!selectedTicker) return;
                e.currentTarget.style.background = "var(--accent-soft)";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={selectedTicker ? `Ask about ${selectedTicker}…` : "Ask about any ticker (e.g. $AAPL or Apple)…"}
          className="input flex-1"
        />
        <button type="submit" disabled={sending} className="btn btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}
