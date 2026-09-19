"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Box, Lightbulb, Map, PlusCircle } from "lucide-react";

import { PlanViewer } from "@/components/drawing/plan-viewer";
import { Apartment3DViewer } from "@/components/three/apartment-3d-viewer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatCurrency } from "@/lib/i18n/format";
import { TENANT_CATEGORY_LABELS } from "@/lib/i18n/he";
import type { DrawingDocument } from "@/lib/drawing/types";
import type { ProductMaterial } from "@/lib/three/materials";
import type { ConfigurationPricing } from "@/lib/pricing/configuration";
import type { Recommendation } from "@/lib/recommendations/engine";
import { selectProduct } from "@/server/actions/selections";
import type { TenantProduct } from "@/server/queries/tenant";
import { cn } from "@/lib/utils";
import type { SupplierCategory } from "@prisma/client";
import { ProductCard } from "./product-card";
import { PriceSummary } from "./price-summary";
import { ExceptionRequestDialog } from "./request-dialogs";

type ViewMode = "2D" | "3D";

export function Configurator({
  products,
  categories,
  pricing,
  recommendations,
  materials,
  document,
  isLocked,
  isSubmitted,
}: {
  products: TenantProduct[];
  categories: SupplierCategory[];
  pricing: ConfigurationPricing;
  recommendations: Recommendation[];
  materials: ProductMaterial[];
  document: DrawingDocument | null;
  isLocked: boolean;
  isSubmitted: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState<SupplierCategory | null>(
    categories[0] ?? null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>(document ? "3D" : "2D");
  const [isPending, startTransition] = useTransition();
  const [isExceptionOpen, setIsExceptionOpen] = useState(false);

  const visibleProducts = useMemo(
    () => products.filter((product) => product.category === activeCategory),
    [products, activeCategory],
  );

  function choose(productId: string, variantId?: string | null) {
    if (isLocked) {
      toast.error("הבחירות נשלחו לבדיקה ואינן ניתנות לשינוי כרגע.");
      return;
    }
    startTransition(async () => {
      const result = await selectProduct({ productId, variantId: variantId ?? null });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  const hasSelections = products.some((product) => product.selectionId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        {/* תצוגת הדירה */}
        {document ? (
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">הדירה שלי</h2>
              <div className="inline-flex rounded-control border border-line-strong bg-surface p-0.5 shadow-subtle">
                {(["2D", "3D"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    aria-pressed={viewMode === mode}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                      viewMode === mode
                        ? "bg-brand-600 text-white"
                        : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {mode === "2D" ? (
                      <Map className="size-3.5" aria-hidden />
                    ) : (
                      <Box className="size-3.5" aria-hidden />
                    )}
                    {mode === "2D" ? "תוכנית" : "תלת-ממד"}
                  </button>
                ))}
              </div>
            </div>

            {viewMode === "3D" ? (
              <Apartment3DViewer
                document={document}
                materials={materials}
                selectedCategory={activeCategory}
                onSelectCategory={(category) => {
                  if (categories.includes(category as SupplierCategory)) {
                    setActiveCategory(category as SupplierCategory);
                  }
                }}
                className="h-[min(58vh,520px)]"
              />
            ) : (
              <PlanViewer standard={document} mode="STANDARD" className="h-[min(58vh,520px)]" />
            )}
          </section>
        ) : null}

        {/* קטגוריות */}
        {categories.length === 0 ? (
          <EmptyState
            title="עדיין לא נפתחו אפשרויות בחירה בפרויקט."
            description="כשיוגדרו ספקים וקטלוגים לפרויקט, האפשרויות שמתאימות לדירה שלך יופיעו כאן."
          />
        ) : (
          <>
            <div
              role="tablist"
              aria-label="קטגוריות"
              className="mb-5 flex gap-1 overflow-x-auto border-b border-line"
            >
              {categories.map((category) => (
                <button
                  key={category}
                  role="tab"
                  type="button"
                  aria-selected={activeCategory === category}
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    "-mb-px border-b-2 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                    activeCategory === category
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {TENANT_CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>

            {visibleProducts.length === 0 ? (
              <EmptyState
                title="אין כרגע אפשרויות נוספות בקטגוריה זו."
                description="מה שכלול בסטנדרט כבר נמצא בדירה שלך."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isSelected={Boolean(product.selectionId)}
                    isLocked={isLocked || isPending}
                    onSelect={() => choose(product.id, product.selectedVariantId)}
                    onSelectVariant={(variantId) => choose(product.id, variantId)}
                  />
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setIsExceptionOpen(true)}>
                <PlusCircle />
                בקש אפשרות אחרת
              </Button>
              <p className="text-[12px] text-ink-muted">
                לא מצאת את מה שחיפשת? אפשר לבקש אפשרות שאינה בקטלוג, והיא תיבדק מול הספק.
              </p>
            </div>
          </>
        )}

        {/* המלצות */}
        {recommendations.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Lightbulb className="size-4 text-warning-600" aria-hidden />
              משלים את מה שבחרת
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {recommendations.map((recommendation) => (
                <li
                  key={recommendation.productId}
                  className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {recommendation.name}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">
                      {recommendation.reason}
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="font-numeric text-[13px] font-medium text-ink">
                      {recommendation.price > 0
                        ? formatCurrency(recommendation.price, { decimals: false })
                        : "כלול"}
                    </p>
                    <button
                      type="button"
                      disabled={isLocked || isPending}
                      onClick={() => {
                        setActiveCategory(recommendation.category);
                        choose(recommendation.productId);
                      }}
                      className="mt-1 text-[12px] font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                    >
                      הוספה
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <PriceSummary
        pricing={pricing}
        canSubmit={hasSelections && !isLocked}
        isSubmitted={isSubmitted}
        isSaving={isPending}
      />

      <ExceptionRequestDialog open={isExceptionOpen} onOpenChange={setIsExceptionOpen} />
    </div>
  );
}
