import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ראשי תיבות לאווטאר: "יעל כהן" → "יכ" */
export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]).join("");
}

export function truncate(value: string, length = 60): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
