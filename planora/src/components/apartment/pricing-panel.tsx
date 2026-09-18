"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Send, Trash2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { TBody, TD, TH, THead, TR, Table, TableWrapper } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { PricingStatusBadge } from "@/components/domain/status-badges";
import { computeTotals, lineTotal } from "@/lib/pricing/engine";
import { formatCurrency, formatDate, formatNumber, UNIT_LABELS } from "@/lib/i18n/format";
import { PRICING_LINE_SOURCE_LABELS } from "@/lib/i18n/he";
import {
  addManualPricingLine,
  generatePricingSheet,
  recordPayment,
  recordTenantApproval,
  removePricingLine,
  sendPricingToTenant,
  updatePricingLine,
  updatePricingSheet,
} from "@/server/actions/pricing";
import type { PricingLineSource, PricingSheetStatus } from "@prisma/client";
import type { WorkspacePermissions } from "./types";

export interface PricingLineView {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  source: PricingLineSource;
  changeReason: string | null;
}

export interface PricingSheetView {
  id: string;
  status: PricingSheetStatus;
  discount: number;
  vatRate: number;
  notes: string | null;
  ownerName: string | null;
  sentAt: Date | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  lines: PricingLineView[];
}

export function PricingPanel({
  apartmentId,
  sheet,
  permissions,
  hasApprovedChanges,
}: {
  apartmentId: string;
  sheet: PricingSheetView | null;
  permissions: WorkspacePermissions;
  hasApprovedChanges: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingLine, setEditingLine] = useState<PricingLineView | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setEditingLine(null);
      setIsAddOpen(false);
      setIsDiscountOpen(false);
    });
  }

  if (!sheet) {
    return (
      <EmptyState
        icon={<Wallet className="size-5" />}
        title="עדיין לא הופק תמחור לדירה זו."
        description={
          hasApprovedChanges
            ? "ניתן להפיק תמחור מהשינויים שאושרו בבדיקה המקצועית."
            : "התמחור יופק לאחר שיאושרו שינויים בבדיקה המקצועית."
        }
        action={
          permissions.canManagePricing && hasApprovedChanges ? (
            <Button
              variant="primary"
              disabled={isPending}
              onClick={() => run(() => generatePricingSheet(apartmentId))}
            >
              <RefreshCw />
              הפק תמחור
            </Button>
          ) : undefined
        }
      />
    );
  }

  const totals = computeTotals(sheet.lines, { discount: sheet.discount, vatRate: sheet.vatRate });
  const isEditable = sheet.status === "DRAFT" && permissions.canManagePricing;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PricingStatusBadge status={sheet.status} />
          {sheet.ownerName ? (
            <span className="text-[12px] text-ink-muted">אחראית תמחור: {sheet.ownerName}</span>
          ) : null}
        </div>

        {permissions.canManagePricing ? (
          <div className="flex flex-wrap gap-2">
            {isEditable ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => generatePricingSheet(apartmentId))}
                >
                  <RefreshCw />
                  רענון מהשינויים המאושרים
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setIsAddOpen(true)}
                >
                  <Plus />
                  שורה ידנית
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setIsDiscountOpen(true)}
                >
                  הנחה
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isPending || sheet.lines.length === 0}
                  onClick={() => run(() => sendPricingToTenant(sheet.id))}
                >
                  <Send />
                  שלח לאישור הדייר
                </Button>
              </>
            ) : null}

            {sheet.status === "SENT_TO_TENANT" ? (
              <Button
                variant="success"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => recordTenantApproval(sheet.id))}
              >
                רישום אישור הדייר
              </Button>
            ) : null}

            {sheet.status === "APPROVED_BY_TENANT" ? (
              <Button
                variant="success"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => recordPayment(sheet.id))}
              >
                רישום תשלום
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>תיאור</TH>
                <TH className="text-left">כמות</TH>
                <TH className="text-left">יחידה</TH>
                <TH className="text-left">מחיר ליחידה</TH>
                <TH className="text-left">סה&rdquo;כ</TH>
                <TH className="text-left">מקור</TH>
                {isEditable ? <TH className="w-20" /> : null}
              </TR>
            </THead>
            <TBody>
              {sheet.lines.length === 0 ? (
                <TR>
                  <TD colSpan={isEditable ? 7 : 6} className="py-10 text-center text-ink-muted">
                    אין עדיין שורות בתמחור.
                  </TD>
                </TR>
              ) : (
                sheet.lines.map((line) => (
                  <TR key={line.id} className="hover:bg-surface-muted/60">
                    <TD className="font-medium text-ink">
                      {line.description}
                      {line.changeReason ? (
                        <span className="mt-0.5 block text-[11px] text-ink-subtle">
                          סיבת שינוי: {line.changeReason}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="font-numeric text-left">
                      {formatNumber(line.quantity, Number.isInteger(line.quantity) ? 0 : 1)}
                    </TD>
                    <TD className="text-left text-ink-muted">
                      {UNIT_LABELS[line.unit] ?? line.unit}
                    </TD>
                    <TD className="font-numeric text-left">{formatCurrency(line.unitPrice)}</TD>
                    <TD className="font-numeric text-left font-semibold text-ink">
                      {formatCurrency(lineTotal(line))}
                    </TD>
                    <TD className="text-left text-[12px] text-ink-muted">
                      {PRICING_LINE_SOURCE_LABELS[line.source]}
                    </TD>
                    {isEditable ? (
                      <TD className="text-left">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`עריכת ${line.description}`}
                            onClick={() => setEditingLine(line)}
                          >
                            <RefreshCw />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`הסרת ${line.description}`}
                            disabled={isPending}
                            onClick={() => run(() => removePricingLine(line.id))}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TD>
                    ) : null}
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrapper>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>סיכום</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2.5">
              <SummaryRow label="סכום לפני מע&rdquo;מ" value={formatCurrency(totals.subtotal)} />
              {totals.discount > 0 ? (
                <SummaryRow label="הנחה" value={`-${formatCurrency(totals.discount)}`} />
              ) : null}
              <SummaryRow
                label={`מע"מ ${formatNumber(sheet.vatRate, 0)}%`}
                value={formatCurrency(totals.vat)}
              />
              <div className="border-t border-line pt-2.5">
                <SummaryRow label="סה&rdquo;כ לתשלום" value={formatCurrency(totals.total)} strong />
              </div>
            </dl>

            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[11px] text-ink-subtle">
              {sheet.sentAt ? (
                <div className="flex justify-between">
                  <dt>נשלח לדייר</dt>
                  <dd className="font-numeric">{formatDate(sheet.sentAt)}</dd>
                </div>
              ) : null}
              {sheet.approvedAt ? (
                <div className="flex justify-between">
                  <dt>אושר על ידי הדייר</dt>
                  <dd className="font-numeric">{formatDate(sheet.approvedAt)}</dd>
                </div>
              ) : null}
              {sheet.paidAt ? (
                <div className="flex justify-between">
                  <dt>שולם</dt>
                  <dd className="font-numeric">{formatDate(sheet.paidAt)}</dd>
                </div>
              ) : null}
            </dl>

            {sheet.notes ? (
              <p className="mt-3 border-t border-line pt-3 text-[12px] leading-5 text-ink-muted">
                {sheet.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {editingLine ? (
        <EditLineDialog
          line={editingLine}
          isPending={isPending}
          onClose={() => setEditingLine(null)}
          onSubmit={(values) => run(() => updatePricingLine({ lineId: editingLine.id, ...values }))}
        />
      ) : null}

      <AddLineDialog
        open={isAddOpen}
        isPending={isPending}
        onOpenChange={setIsAddOpen}
        onSubmit={(values) =>
          run(() => addManualPricingLine({ pricingSheetId: sheet.id, ...values }))
        }
      />

      <DiscountDialog
        open={isDiscountOpen}
        isPending={isPending}
        current={sheet.discount}
        onOpenChange={setIsDiscountOpen}
        onSubmit={(discount) =>
          run(() => updatePricingSheet({ pricingSheetId: sheet.id, discount }))
        }
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "text-[13px] font-medium text-ink" : "text-[13px] text-ink-muted"}>
        {label}
      </dt>
      <dd
        className={
          strong
            ? "font-numeric text-[17px] font-semibold text-ink"
            : "font-numeric text-[13px] text-ink-soft"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function EditLineDialog({
  line,
  isPending,
  onClose,
  onSubmit,
}: {
  line: PricingLineView;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: {
    description: string;
    quantity: number;
    unitPrice: number;
    changeReason?: string;
  }) => void;
}) {
  const [description, setDescription] = useState(line.description);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [unitPrice, setUnitPrice] = useState(String(line.unitPrice));
  const [changeReason, setChangeReason] = useState(line.changeReason ?? "");

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עריכת שורת תמחור</DialogTitle>
          <DialogDescription>
            שורה שנערכת ידנית לא תידרס ברענון התמחור מהשינויים המאושרים.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="line-description">תיאור</Label>
            <Input
              id="line-description"
              className="mt-1.5"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="line-quantity">כמות</Label>
              <Input
                id="line-quantity"
                type="number"
                step="0.1"
                min="0"
                className="mt-1.5"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="line-price">מחיר ליחידה</Label>
              <Input
                id="line-price"
                type="number"
                step="1"
                min="0"
                className="mt-1.5"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="line-reason">סיבת השינוי</Label>
            <Input
              id="line-reason"
              className="mt-1.5"
              value={changeReason}
              onChange={(event) => setChangeReason(event.target.value)}
              placeholder="למשל: סוכם מול הדייר במסגרת חבילת שינויים"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="primary"
            disabled={isPending}
            onClick={() =>
              onSubmit({
                description,
                quantity: Number(quantity) || 0,
                unitPrice: Number(unitPrice) || 0,
                changeReason: changeReason.trim() || undefined,
              })
            }
          >
            שמירה
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLineDialog({
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }) => void;
}) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("UNIT");
  const [unitPrice, setUnitPrice] = useState("0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הוספת שורה ידנית</DialogTitle>
          <DialogDescription>
            שורה שאינה נגזרת משינוי מזוהה — למשל עבודה שסוכמה ישירות מול הדייר.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="manual-description">תיאור</Label>
            <Input
              id="manual-description"
              className="mt-1.5"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="manual-quantity">כמות</Label>
              <Input
                id="manual-quantity"
                type="number"
                step="0.1"
                min="0"
                className="mt-1.5"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="manual-unit">יחידה</Label>
              <Select
                id="manual-unit"
                className="mt-1.5"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              >
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="manual-price">מחיר ליחידה</Label>
              <Input
                id="manual-price"
                type="number"
                step="1"
                min="0"
                className="mt-1.5"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="primary"
            disabled={isPending || description.trim().length === 0}
            onClick={() =>
              onSubmit({
                description,
                quantity: Number(quantity) || 0,
                unit,
                unitPrice: Number(unitPrice) || 0,
              })
            }
          >
            הוספה
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiscountDialog({
  open,
  isPending,
  current,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  isPending: boolean;
  current: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (discount: number) => void;
}) {
  const [discount, setDiscount] = useState(String(current));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הנחה</DialogTitle>
          <DialogDescription>ההנחה מחושבת על הסכום שלפני מע&rdquo;מ.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Label htmlFor="discount-value">סכום ההנחה בשקלים</Label>
          <Input
            id="discount-value"
            type="number"
            min="0"
            step="10"
            className="mt-1.5"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="primary"
            disabled={isPending}
            onClick={() => onSubmit(Number(discount) || 0)}
          >
            שמירה
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
