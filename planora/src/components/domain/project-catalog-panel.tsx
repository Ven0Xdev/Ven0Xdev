"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { SupplierCategory } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { formatCurrency } from "@/lib/i18n/format";
import { SUPPLIER_CATEGORY_LABELS } from "@/lib/i18n/he";
import { setProductAvailability, setProjectSupplier } from "@/server/actions/catalog";

export interface CatalogProductRow {
  id: string;
  name: string;
  sku: string;
  category: SupplierCategory;
  available: boolean;
  includedInStandard: boolean;
  upgradePrice: number;
  requiresApproval: boolean;
  requiresConsultant: boolean;
}

export interface CatalogSupplierRow {
  id: string;
  name: string;
  category: SupplierCategory;
  connected: boolean;
  products: CatalogProductRow[];
}

/**
 * שליטת הקבלן בקטלוג הפרויקט.
 * מוצר שאינו מופעל כאן לעולם אינו מוצג לדייר.
 */
export function ProjectCatalogPanel({
  projectId,
  suppliers,
  canManage,
}: {
  projectId: string;
  suppliers: CatalogSupplierRow[];
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  if (suppliers.length === 0) {
    return (
      <EmptyState
        title="לא הוגדרו ספקים לארגון."
        description="ספקים וקטלוגים מוגדרים ברמת הארגון, ומחוברים לפרויקט מכאן."
      />
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-6 text-ink-muted">
        כאן נקבע מה הדייר יכול לבחור. מוצר שאינו מסומן כזמין אינו מוצג באזור האישי של
        הדייר — לא כאפשרות מנוטרלת ולא בשום צורה אחרת.
      </p>

      {suppliers.map((supplier) => (
        <Card key={supplier.id}>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-semibold text-ink">{supplier.name}</h3>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {SUPPLIER_CATEGORY_LABELS[supplier.category]}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={supplier.connected ? "success" : "neutral"}>
                  {supplier.connected ? "מחובר לפרויקט" : "לא מחובר"}
                </Badge>
                {canManage ? (
                  <Button
                    variant={supplier.connected ? "outline" : "primary"}
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        setProjectSupplier({
                          projectId,
                          supplierId: supplier.id,
                          active: !supplier.connected,
                        }),
                      )
                    }
                  >
                    {supplier.connected ? "נתק מהפרויקט" : "חבר לפרויקט"}
                  </Button>
                ) : null}
              </div>
            </div>

            {supplier.connected && supplier.products.length > 0 ? (
              <div className="mt-4">
                <TableWrapper className="shadow-none">
                  <Table>
                    <THead>
                      <TR>
                        <TH>מוצר</TH>
                        <TH className="text-left">זמין לדייר</TH>
                        <TH className="text-left">כלול בסטנדרט</TH>
                        <TH className="text-left">מחיר שדרוג</TH>
                        <TH className="text-left">דורש אישור</TH>
                        {canManage ? <TH className="w-20" /> : null}
                      </TR>
                    </THead>
                    <TBody>
                      {supplier.products.map((product) => (
                        <ProductRow
                          key={product.id}
                          projectId={projectId}
                          product={product}
                          canManage={canManage}
                          isPending={isPending}
                          onSave={run}
                        />
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProductRow({
  projectId,
  product,
  canManage,
  isPending,
  onSave,
}: {
  projectId: string;
  product: CatalogProductRow;
  canManage: boolean;
  isPending: boolean;
  onSave: (action: () => Promise<{ ok: boolean; message: string }>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [available, setAvailable] = useState(product.available);
  const [includedInStandard, setIncluded] = useState(product.includedInStandard);
  const [upgradePrice, setPrice] = useState(String(product.upgradePrice));
  const [requiresApproval, setApproval] = useState(product.requiresApproval);

  if (!isEditing) {
    return (
      <TR>
        <TD className="font-medium text-ink">
          {product.name}
          <span className="font-numeric mt-0.5 block text-[11px] text-ink-subtle">
            {product.sku}
          </span>
        </TD>
        <TD className="text-left">
          <Badge tone={product.available ? "success" : "neutral"} size="sm">
            {product.available ? "זמין" : "לא זמין"}
          </Badge>
        </TD>
        <TD className="text-left text-[12px] text-ink-muted">
          {product.includedInStandard ? "כן" : "לא"}
        </TD>
        <TD className="font-numeric text-left">
          {product.includedInStandard
            ? "—"
            : formatCurrency(product.upgradePrice, { decimals: false })}
        </TD>
        <TD className="text-left text-[12px] text-ink-muted">
          {product.requiresConsultant
            ? "יועץ"
            : product.requiresApproval
              ? "מנהלת"
              : "לא"}
        </TD>
        {canManage ? (
          <TD className="text-left">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
              עריכה
            </Button>
          </TD>
        ) : null}
      </TR>
    );
  }

  return (
    <TR className="bg-surface-muted/60">
      <TD className="font-medium text-ink">{product.name}</TD>
      <TD className="text-left">
        <input
          type="checkbox"
          checked={available}
          onChange={(event) => setAvailable(event.target.checked)}
          aria-label="זמין לדייר"
          className="size-4 accent-[var(--color-brand-600)]"
        />
      </TD>
      <TD className="text-left">
        <input
          type="checkbox"
          checked={includedInStandard}
          onChange={(event) => setIncluded(event.target.checked)}
          aria-label="כלול בסטנדרט"
          className="size-4 accent-[var(--color-brand-600)]"
        />
      </TD>
      <TD className="text-left">
        <Input
          type="number"
          min="0"
          value={upgradePrice}
          onChange={(event) => setPrice(event.target.value)}
          aria-label="מחיר שדרוג"
          className="h-8 w-28"
        />
      </TD>
      <TD className="text-left">
        <input
          type="checkbox"
          checked={requiresApproval}
          onChange={(event) => setApproval(event.target.checked)}
          aria-label="דורש אישור"
          className="size-4 accent-[var(--color-brand-600)]"
        />
      </TD>
      <TD className="text-left">
        <div className="flex justify-end gap-1">
          <Button
            variant="primary"
            size="sm"
            disabled={isPending}
            onClick={() => {
              onSave(() =>
                setProductAvailability({
                  projectId,
                  productId: product.id,
                  available,
                  includedInStandard,
                  upgradePrice: Number(upgradePrice) || 0,
                  requiresApproval,
                  requiresConsultant: product.requiresConsultant,
                }),
              );
              setIsEditing(false);
            }}
          >
            שמירה
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
            ביטול
          </Button>
        </div>
      </TD>
    </TR>
  );
}
