"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

function ChatPageBody() {
  // useSearchParams requires a Suspense boundary in production builds
  // (client-side-rendered up to the nearest one during prerendering) —
  // see node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md.
  const searchParams = useSearchParams();
  const tickerParam = searchParams.get("ticker");
  const initialTicker = tickerParam ? tickerParam.toUpperCase() : undefined;
  return <ChatWidget initialTicker={initialTicker} />;
}

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Research Assistant"
        description={'Select a ticker, or mention one directly (e.g. "$AAPL" or "what about Apple?") to ground the conversation in its current AI analysis.'}
      />
      <div className="card animate-in flex h-[600px] flex-col p-4">
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          <ChatPageBody />
        </Suspense>
      </div>
    </div>
  );
}
