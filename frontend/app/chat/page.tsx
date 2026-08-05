"use client";

import { ChatWidget } from "@/components/chat/ChatWidget";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Research Assistant"
        description={'Mention a ticker (e.g. "$AXNT" or "what about AXNT") to ground the conversation in its current AI analysis.'}
      />
      <div className="card animate-in flex h-[600px] flex-col p-4">
        <ChatWidget />
      </div>
    </div>
  );
}
