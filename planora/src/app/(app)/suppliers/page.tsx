import type { Metadata } from "next";
import { Package, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { requireUser, primaryRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/i18n/format";
import { SUPPLIER_CATEGORY_LABELS } from "@/lib/i18n/he";
import { AccessDeniedError } from "@/lib/auth/session";

export const metadata: Metadata = { title: "ספקים" };

export default async function SuppliersPage() {
  const user = await requireUser();
  const role = user.isSuperAdmin ? "SUPER_ADMIN" : primaryRole(user);

  if (!can(role, "supplier:manage")) {
    throw new AccessDeniedError("אין לך הרשאה לצפות בספקים");
  }

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: { in: user.organizationIds } },
    include: {
      catalogs: { select: { id: true, name: true, year: true } },
      products: {
        include: {
          variants: { where: { active: true }, select: { id: true } },
          availability: { select: { projectId: true, available: true, upgradePrice: true } },
        },
        orderBy: { name: "asc" },
      },
      projectSuppliers: {
        where: { active: true },
        include: { project: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="ספקים וקטלוגים"
        description="הספקים שעובדים עם הארגון, הקטלוגים שלהם והמוצרים שניתן להפעיל בפרויקטים."
      />

      {suppliers.length === 0 ? (
        <EmptyState
          icon={<Store className="size-5" />}
          title="עדיין לא הוגדרו ספקים."
          description="ספק שיתווסף לארגון יופיע כאן, יחד עם הקטלוגים והמוצרים שלו."
        />
      ) : (
        <div className="space-y-5">
          {suppliers.map((supplier) => (
            <Card key={supplier.id}>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-ink">{supplier.name}</h2>
                    <p className="mt-1 text-[12px] text-ink-muted">
                      {SUPPLIER_CATEGORY_LABELS[supplier.category]}
                      {supplier.contactName ? ` · ${supplier.contactName}` : ""}
                      {supplier.contactPhone ? (
                        <span className="font-numeric"> · {supplier.contactPhone}</span>
                      ) : null}
                    </p>
                    {supplier.description ? (
                      <p className="mt-2 max-w-2xl text-[12px] leading-5 text-ink-muted">
                        {supplier.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {supplier.catalogs.map((catalog) => (
                      <Badge key={catalog.id} tone="neutral">
                        {catalog.name}
                      </Badge>
                    ))}
                    <Badge tone={supplier.active ? "success" : "neutral"}>
                      {supplier.active ? "פעיל" : "לא פעיל"}
                    </Badge>
                  </div>
                </div>

                {supplier.projectSuppliers.length > 0 ? (
                  <p className="mt-3 text-[12px] text-ink-muted">
                    מחובר לפרויקטים:{" "}
                    {supplier.projectSuppliers.map((entry) => entry.project.name).join(", ")}
                  </p>
                ) : (
                  <p className="mt-3 text-[12px] text-ink-subtle">
                    הספק אינו מחובר לאף פרויקט, ולכן מוצריו אינם מוצגים לדיירים.
                  </p>
                )}

                {supplier.products.length > 0 ? (
                  <div className="mt-4">
                    <TableWrapper className="shadow-none">
                      <Table>
                        <THead>
                          <TR>
                            <TH>מוצר</TH>
                            <TH>מק&rdquo;ט</TH>
                            <TH>קטגוריה</TH>
                            <TH className="text-left">אפשרויות</TH>
                            <TH className="text-left">מחיר בסיס</TH>
                            <TH className="text-left">פעיל בפרויקטים</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {supplier.products.map((product) => (
                            <TR key={product.id}>
                              <TD className="font-medium text-ink">{product.name}</TD>
                              <TD className="font-numeric text-ink-muted">{product.sku}</TD>
                              <TD className="text-ink-muted">
                                {SUPPLIER_CATEGORY_LABELS[product.category]}
                              </TD>
                              <TD className="font-numeric text-left">
                                {product.variants.length || "—"}
                              </TD>
                              <TD className="font-numeric text-left">
                                {product.basePrice > 0
                                  ? formatCurrency(product.basePrice, { decimals: false })
                                  : "כלול"}
                              </TD>
                              <TD className="font-numeric text-left">
                                {product.availability.filter((entry) => entry.available).length ||
                                  "—"}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </TableWrapper>
                  </div>
                ) : (
                  <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-subtle">
                    <Package className="size-3.5" aria-hidden />
                    לספק זה אין עדיין מוצרים בקטלוג.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-[12px] leading-5 text-ink-muted">
        הפעלת מוצר לדיירים נעשית בעמוד הפרויקט, בלשונית &rdquo;ספקים וקטלוגים&ldquo;. מוצר
        שאינו מופעל בפרויקט לעולם אינו מוצג לדייר.
      </p>
    </>
  );
}
