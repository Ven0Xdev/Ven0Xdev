"use client";

import { Check, Info, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/i18n/format";
import { PRODUCT_ELIGIBILITY_LABELS, PRODUCT_ELIGIBILITY_TONE } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import type { TenantProduct, TenantVariant } from "@/server/queries/tenant";

export function ProductCard({
  product,
  isSelected,
  isLocked,
  onSelect,
  onSelectVariant,
}: {
  product: TenantProduct;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onSelectVariant: (variantId: string) => void;
}) {
  const eligibility = product.eligibility.eligibility as keyof typeof PRODUCT_ELIGIBILITY_LABELS;
  const colorVariants = product.variants.filter((variant) => variant.color);
  const otherVariants = product.variants.filter((variant) => !variant.color);

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-card border bg-surface shadow-card transition-all",
        isSelected ? "border-brand-500 ring-1 ring-brand-200" : "border-line hover:border-line-strong",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={isLocked}
        aria-pressed={isSelected}
        className="relative aspect-[4/3] w-full overflow-hidden bg-surface-sunken disabled:cursor-not-allowed"
      >
        <ProductVisual product={product} />

        {isSelected ? (
          <span className="absolute top-2.5 end-2.5 flex size-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-subtle">
            <Check className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold text-ink">{product.name}</h3>
            <p className="mt-0.5 truncate text-[12px] text-ink-muted">{product.supplierName}</p>
          </div>
          <Badge tone={PRODUCT_ELIGIBILITY_TONE[eligibility]}>
            {PRODUCT_ELIGIBILITY_LABELS[eligibility]}
          </Badge>
        </div>

        {product.description ? (
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-ink-muted">
            {product.description}
          </p>
        ) : null}

        {colorVariants.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] text-ink-subtle">גוונים</p>
            <div className="flex flex-wrap gap-1.5">
              {colorVariants.map((variant) => (
                <VariantSwatch
                  key={variant.id}
                  variant={variant}
                  isActive={product.selectedVariantId === variant.id}
                  disabled={isLocked}
                  onClick={() => onSelectVariant(variant.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {otherVariants.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] text-ink-subtle">אפשרויות</p>
            <div className="flex flex-wrap gap-1.5">
              {otherVariants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => onSelectVariant(variant.id)}
                  aria-pressed={product.selectedVariantId === variant.id}
                  className={cn(
                    "rounded-control border px-2 py-1 text-[11px] transition-colors disabled:opacity-50",
                    product.selectedVariantId === variant.id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line-strong text-ink-muted hover:text-ink",
                  )}
                >
                  {variant.name}
                  {variant.priceDelta > 0 ? (
                    <span className="font-numeric ms-1 text-ink-subtle">
                      +{formatCurrency(variant.priceDelta, { decimals: false })}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            {product.eligibility.price > 0 ? (
              <p className="font-numeric text-[17px] font-semibold text-ink">
                {formatCurrency(product.eligibility.price, { decimals: false })}
              </p>
            ) : (
              <p className="text-[13px] font-medium text-success-700">ללא תוספת תשלום</p>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-subtle">
              {product.eligibility.reason ? (
                <Hint label={product.eligibility.reason}>
                  <span className="flex items-center gap-1 text-warning-700">
                    <Info className="size-3" aria-hidden />
                    נדרשת בדיקה
                  </span>
                </Hint>
              ) : (
                <span className="flex items-center gap-1 text-success-700">
                  <Sparkles className="size-3" aria-hidden />
                  מתאים לדירה שלך
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onSelect}
            disabled={isLocked}
            className={cn(
              "rounded-control px-3 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              isSelected
                ? "bg-brand-50 text-brand-700"
                : "bg-brand-600 text-white hover:bg-brand-700",
            )}
          >
            {isSelected ? "נבחר" : "בחירה"}
          </button>
        </div>
      </div>
    </article>
  );
}

function VariantSwatch({
  variant,
  isActive,
  disabled,
  onClick,
}: {
  variant: TenantVariant;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Hint
      label={
        variant.priceDelta > 0
          ? `${variant.name} · +${formatCurrency(variant.priceDelta, { decimals: false })}`
          : variant.name
      }
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={variant.name}
        aria-pressed={isActive}
        className={cn(
          "size-7 rounded-full border-2 transition-all disabled:opacity-50",
          isActive ? "border-brand-600 ring-2 ring-brand-100" : "border-line-strong",
        )}
        style={{ backgroundColor: variant.color ?? "#cccccc" }}
      />
    </Hint>
  );
}

/**
 * ייצוג ויזואלי של המוצר.
 * אין לנו תצלומי מוצר אמיתיים, ולכן מוצג ייצוג גיאומטרי נקי שנגזר מגוון
 * המוצר — ולא תמונת מלאי גנרית שמתחזה למוצר.
 */
function ProductVisual({ product }: { product: TenantProduct }) {
  if (product.imageUrl) {
    // תמונות מוצר מגיעות מכתובות של ספקים חיצוניים, ולכן לא עוברות דרך next/image
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.imageUrl}
        alt={product.name}
        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    );
  }

  const activeColor =
    product.variants.find((variant) => variant.id === product.selectedVariantId)?.color ??
    product.variants.find((variant) => variant.color)?.color ??
    "#d9d2c7";

  return (
    <div
      className="size-full transition-transform duration-300 group-hover:scale-[1.02]"
      style={{ backgroundColor: activeColor }}
      aria-hidden
    >
      <svg viewBox="0 0 120 90" className="size-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`sheen-${product.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <rect width="120" height="90" fill={`url(#sheen-${product.id})`} />
        <g stroke="#000000" strokeOpacity="0.1" strokeWidth="0.6" fill="none">
          <path d="M0 60 H120" />
          <path d="M40 60 V90 M80 60 V90" />
          <path d="M18 18 h30 v26 h-30 z" />
        </g>
      </svg>
    </div>
  );
}
