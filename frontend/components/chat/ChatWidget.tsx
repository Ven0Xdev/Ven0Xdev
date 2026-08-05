"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

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

export function ChatWidget({ initialTicker }: { initialTicker?: string }) {
  const [sessionKey] = useState(() => sessionKeyFor(initialTicker));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .chatHistory(sessionKey)
      .then((h) => setMessages(h.messages as ChatMessage[]))
      .catch(() => setMessages([]));
  }, [sessionKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    try {
      const res = await api.sendChatMessage(sessionKey, text, initialTicker);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error reaching assistant: ${String(e)}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Ask about risk, catalysts, confidence, position sizing, or what would invalidate this setup.
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {messages.map((m, i) => (
            <div
              key={i}
              className="animate-in max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "var(--accent)" : "var(--surface-2)",
                color: m.role === "user" ? "var(--text-on-accent)" : "var(--text-primary)",
                borderBottomRightRadius: m.role === "user" ? 4 : undefined,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : undefined,
              }}
            >
              {m.content}
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

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-secondary)",
              transition: "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
            }}
            onMouseEnter={(e) => {
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
          placeholder={initialTicker ? `Ask about ${initialTicker}…` : "Ask about any ticker…"}
          className="input flex-1"
        />
        <button type="submit" disabled={sending} className="btn btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}
