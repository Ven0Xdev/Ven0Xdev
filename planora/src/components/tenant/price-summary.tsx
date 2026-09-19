"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/i18n/format";
import { TENANT_CATEGORY_LABELS } from "@/lib/i18n/he";
import { submitConfiguration } from "@/server/actions/selections";
import type { ConfigurationPricing } from "@/lib/pricing/configuration";

/**
 * סיכום המחיר לדייר.
 *
 * מוצג כאן אך ורק מה שהדייר משלם. המודל המסחרי הפנימי — דמי הקמה, עמלה
 * לדירה ואחוז עמלה על שינויים משמעותיים — אינו נחשף כאן בשום צורה.
 */
export function PriceSummary({
  pricing,
  canSubmit,
  isSubmitted,
  isSaving,
}: {
  pricing: ConfigurationPricing;
  canSubmit: boolean;
  isSubmitted: boolean;
  isSaving: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <aside className="sticky top-32 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-ink">המחיר שלי</h2>
        {isSaving ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            מעדכן מחיר...
          </span>
        ) : null}
      </div>

      {pricing.byCategory.length === 0 ? (
        <p className="mt-4 text-[13px] leading-6 text-ink-muted">
          עדיין לא בחרת שדרוגים. כל מה שכלול בסטנדרט כבר נמצא בדירה שלך.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {pricing.byCategory.map((row) => (
            <li key={row.category} className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink-soft">
                {TENANT_CATEGORY_LABELS[row.category]}
              </span>
              <span className="font-numeric text-[13px] font-medium text-ink">
                {formatCurrency(row.total, { decimals: false })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pricing.professionalChangesTotal > 0 ? (
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="text-[13px] text-ink-soft">שינויים בתוכנית</span>
          <span className="font-numeric text-[13px] font-medium text-ink">
            {formatCurrency(pricing.professionalChangesTotal, { decimals: false })}
          </span>
        </div>
      ) : null}

      <dl className="mt-4 space-y-2 border-t border-line pt-4">
        <Row label="סכום לפני מע&rdquo;מ" value={formatCurrency(pricing.totals.subtotal)} />
        {pricing.totals.discount > 0 ? (
          <Row label="הנחה" value={`-${formatCurrency(pricing.totals.discount)}`} />
        ) : null}
        <Row label="מע&rdquo;מ" value={formatCurrency(pricing.totals.vat)} />
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className="text-[13px] font-medium text-ink">סה&rdquo;כ</span>
        <span className="font-numeric text-[22px] leading-7 font-semibold text-ink">
          {formatCurrency(pricing.totals.total)}
        </span>
      </div>

      {pricing.draftCount > 0 ? (
        <p className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-[11px] leading-5 text-ink-muted">
          {pricing.draftCount} בחירות עדיין בטיוטה. המחיר הסופי נקבע לאחר בדיקה ואישור.
        </p>
      ) : null}

      {isSubmitted ? (
        <p className="mt-4 rounded-control border border-brand-200 bg-brand-50 px-3 py-2.5 text-[12px] leading-5 text-brand-800">
          הבחירות נשלחו לבדיקה. מנהלת שינויי הדיירים תעדכן אותך לאחר הבדיקה.
        </p>
      ) : (
        <Button
          variant="primary"
          size="lg"
          className="mt-5 w-full justify-center"
          disabled={!canSubmit || isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await submitConfiguration();
              if (result.ok) toast.success(result.message);
              else toast.error(result.message);
            })
          }
        >
          <Send />
          {isPending ? "שולח..." : "שלח לבדיקה"}
        </Button>
      )}

      <p className="mt-3 text-[11px] leading-5 text-ink-subtle">
        שליחה לבדיקה אינה מחייבת בתשלום. לאחר הבדיקה תקבל פירוט מחיר סופי לאישורך.
      </p>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="font-numeric text-[13px] text-ink-soft">{value}</dd>
    </div>
  );
}
