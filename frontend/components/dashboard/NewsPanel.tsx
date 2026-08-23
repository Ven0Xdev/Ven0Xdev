"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { NewsPipelineArticle } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";

const SENTIMENT_STYLES: Record<string, { label: string; color: string }> = {
  positive: { label: "Positive", color: "var(--status-good)" },
  negative: { label: "Negative", color: "var(--status-critical)" },
  neutral: { label: "Neutral", color: "var(--text-muted)" },
  uncertain: { label: "Uncertain", color: "var(--status-warning, var(--text-muted))" },
};

/** Alpaca-backed news feed for a symbol — persisted, deduplicated, and
 * deterministically classified (sentiment/category/reliability/novelty/
 * relevance/impact are keyword-lexicon heuristics, never an ML or LLM
 * claim). Read-only: nothing here places, opens, or suggests a paper
 * order — see the "Nexora Internal Paper" label everywhere the platform
 * actually executes anything. */
export function NewsPanel({ symbol }: { symbol: string }) {
  const [articles, setArticles] = useState<NewsPipelineArticle[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api
      .newsForSymbol(symbol)
      .then((r) => setArticles(r.articles))
      .catch(setError);
  }, [symbol]);

  return (
    <div className="card animate-in p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            News
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Real Alpaca news for {symbol} — deduplicated and classified, never fabricated.
          </p>
        </div>
      </div>

      {error !== null && (
        <p className="mt-3 text-xs" style={{ color: "var(--status-critical)" }}>
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {articles === null && error === null ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          Loading news…
        </p>
      ) : articles !== null && articles.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          No news articles for {symbol} yet.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {articles?.map((a) => {
            const style = SENTIMENT_STYLES[a.sentiment_label] ?? SENTIMENT_STYLES.neutral;
            return (
              <li key={a.id} className="border-b pb-3 last:border-b-0 last:pb-0" style={{ borderColor: "var(--border)" }}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium leading-snug hover:underline"
                  style={{ color: "var(--text-primary)" }}
                >
                  {a.headline}
                </a>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
                    style={{ color: style.color, background: `color-mix(in srgb, ${style.color} 15%, transparent)` }}
                  >
                    {style.label}
                  </span>
                  {a.category && (
                    <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                      {a.category.replace(/_/g, " ")}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {a.source} · <LocalTime iso={a.published_at} options={{ style: "short" }} />
                  </span>
                  {a.update_count > 0 && (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      updated {a.update_count}×
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
