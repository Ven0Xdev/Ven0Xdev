"use client";

import { ChatWidget } from "@/components/chat/ChatWidget";

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Research Assistant</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Mention a ticker (e.g. &ldquo;$AXNT&rdquo; or &ldquo;what about AXNT&rdquo;) to ground the conversation in its current AI analysis.
        </p>
      </div>
      <div className="card flex h-[600px] flex-col p-4">
        <ChatWidget />
      </div>
    </div>
  );
}
