/**
 * פורמטים ישראליים.
 * כל הצגה של מספר, מחיר, תאריך או שעה במערכת עוברת דרך הקובץ הזה.
 */

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** 12450 → "12,450" */
export function formatNumber(value: number, fractionDigits?: number): string {
  if (!Number.isFinite(value)) return "—";
  if (fractionDigits !== undefined) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }
  return numberFormatter.format(value);
}

/** 12450 → "₪12,450" */
export function formatCurrency(value: number, options?: { decimals?: boolean }): string {
  if (!Number.isFinite(value)) return "—";
  const decimals = options?.decimals ?? !Number.isInteger(value);
  const sign = value < 0 ? "-" : "";
  const formatted = formatNumber(Math.abs(value), decimals ? 2 : 0);
  return `${sign}₪${formatted}`;
}

/** 0.985 → "98.5%" */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${formatNumber(ratio * 100, fractionDigits)}%`;
}

/** Date → "18.09.2026" */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Date → "14:30" */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Date → "18.09.2026, 14:30" */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** זמן יחסי בעברית: "לפני 3 שעות" */
export function formatRelative(value: Date | string | null | undefined, now = new Date()): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "כרגע";
  if (minutes < 60) return minutes === 1 ? "לפני דקה" : `לפני ${minutes} דקות`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;

  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "לפני שבוע" : `לפני ${weeks} שבועות`;
  }
  return formatDate(date);
}

export function formatFloor(number: number | null | undefined): string {
  if (number === null || number === undefined) return "—";
  if (number === 0) return "קומת קרקע";
  if (number < 0) return `קומה ${Math.abs(number)}- (חניון)`;
  return `קומה ${number}`;
}

export function formatApartment(number: string | number | null | undefined): string {
  if (number === null || number === undefined || number === "") return "—";
  return `דירה ${number}`;
}

export function formatBuilding(name: string | null | undefined): string {
  if (!name) return "—";
  return name.startsWith("בניין") ? name : `בניין ${name}`;
}

/** 4.2 → "4.2 מ'" */
export function formatQuantity(quantity: number, unit: string): string {
  const unitLabel = UNIT_LABELS[unit] ?? unit;
  const value = formatNumber(quantity, Number.isInteger(quantity) ? 0 : 1);
  return unitLabel ? `${value} ${unitLabel}` : value;
}

export const UNIT_LABELS: Record<string, string> = {
  UNIT: "יח'",
  METER: "מ'",
  SQM: "מ\"ר",
  POINT: "נק'",
  HOUR: "ש'",
  LUMP: "קומפלט",
};

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} בייט`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}

/** ריבוי בעברית: 1 דירה / 2 דירות */
export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
