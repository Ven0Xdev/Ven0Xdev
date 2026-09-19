"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { CHANGE_CATEGORY_LABELS, TENANT_CATEGORY_LABELS } from "@/lib/i18n/he";
import {
  submitChangeRequest,
  submitExceptionRequest,
} from "@/server/actions/tenant-requests";

const CHANGE_CATEGORIES = [
  "ELECTRICAL",
  "WALL",
  "KITCHEN",
  "PLUMBING",
  "HVAC",
  "LIGHTING",
  "OTHER",
] as const;

const SUPPLIER_CATEGORIES = [
  "KITCHEN",
  "FLOORING",
  "SANITARY",
  "DOORS",
  "LIGHTING",
  "OUTDOOR",
  "APPLIANCES",
  "OTHER",
] as const;

/** בקשת שינוי בתוכנית — לא בחירת מוצר מהקטלוג */
export function ChangeRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<(typeof CHANGE_CATEGORIES)[number]>("ELECTRICAL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>בקשת שינוי</DialogTitle>
          <DialogDescription>
            תארי או תאר מה תרצו לשנות. הבקשה נשלחת למנהלת שינויי הדיירים, ותועבר
            לאישור יועץ מקצועי אם הדבר נדרש.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="request-category">נושא הבקשה</Label>
            <Select
              id="request-category"
              className="mt-1.5"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as (typeof CHANGE_CATEGORIES)[number])
              }
            >
              {CHANGE_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {CHANGE_CATEGORY_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="request-title">כותרת</Label>
            <Input
              id="request-title"
              className="mt-1.5"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="למשל: הוספת שקע בפינת העבודה"
            />
          </div>

          <div>
            <Label htmlFor="request-description">פירוט</Label>
            <Textarea
              id="request-description"
              className="mt-1.5 min-h-24"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="ככל שתפרטו יותר, כך הבדיקה תהיה מהירה יותר."
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="primary"
            disabled={isPending || title.trim().length < 3 || description.trim().length < 5}
            onClick={() =>
              startTransition(async () => {
                const result = await submitChangeRequest({ category, title, description });
                if (result.ok) {
                  toast.success(result.message);
                  setTitle("");
                  setDescription("");
                  onOpenChange(false);
                } else {
                  toast.error(result.message);
                }
              })
            }
          >
            שליחת הבקשה
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** בקשה למוצר שאינו בקטלוג הפרויקט */
export function ExceptionRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<(typeof SUPPLIER_CATEGORIES)[number]>("KITCHEN");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>בקשה לאפשרות אחרת</DialogTitle>
          <DialogDescription>
            הבקשה אינה מוסיפה את הפריט לדירה. מנהלת שינויי הדיירים תבדוק אותה מול הספק
            ותחזור אליך עם תשובה.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="exception-category">קטגוריה</Label>
            <Select
              id="exception-category"
              className="mt-1.5"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as (typeof SUPPLIER_CATEGORIES)[number])
              }
            >
              {SUPPLIER_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {TENANT_CATEGORY_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="exception-title">מה תרצו לבקש</Label>
            <Input
              id="exception-title"
              className="mt-1.5"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="למשל: חזית מטבח בגוון אחר"
            />
          </div>

          <div>
            <Label htmlFor="exception-description">פירוט</Label>
            <Textarea
              id="exception-description"
              className="mt-1.5 min-h-24"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="exception-url">קישור לדוגמה (לא חובה)</Label>
            <Input
              id="exception-url"
              type="url"
              dir="ltr"
              className="mt-1.5"
              value={referenceUrl}
              onChange={(event) => setReferenceUrl(event.target.value)}
              placeholder="https://"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="primary"
            disabled={isPending || title.trim().length < 3 || description.trim().length < 5}
            onClick={() =>
              startTransition(async () => {
                const result = await submitExceptionRequest({
                  category,
                  title,
                  description,
                  referenceUrl: referenceUrl || undefined,
                });
                if (result.ok) {
                  toast.success(result.message);
                  setTitle("");
                  setDescription("");
                  setReferenceUrl("");
                  onOpenChange(false);
                } else {
                  toast.error(result.message);
                }
              })
            }
          >
            שליחת הבקשה
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
