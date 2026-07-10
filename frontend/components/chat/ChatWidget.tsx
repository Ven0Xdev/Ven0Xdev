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
        <div className="flex flex-col gap-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className="max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed"
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "var(--series-blue)" : "var(--page-plane)",
                color: m.role === "user" ? "#fff" : "var(--text-primary)",
              }}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="max-w-[92%] self-start rounded-xl px-3 py-2 text-sm" style={{ background: "var(--page-plane)", color: "var(--text-muted)" }}>
              Thinking…
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="rounded-full px-2.5 py-1 text-xs"
            style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={initialTicker ? `Ask about ${initialTicker}…` : "Ask about any ticker…"}
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--series-blue)", color: "#fff" }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
