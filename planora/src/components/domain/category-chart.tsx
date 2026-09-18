"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface CategoryDatum {
  label: string;
  detections: number;
  corrections: number;
  agreement: number;
}

/** פילוח זיהויים ותיקונים לפי קטגוריה */
export function CategoryChart({ data }: { data: CategoryDatum[] }) {
  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-line)" }}
            reversed
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-ink-subtle)" }}
            tickLine={false}
            axisLine={false}
            orientation="right"
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-sunken)" }}
            contentStyle={{
              direction: "rtl",
              fontSize: 12,
              borderRadius: 10,
              border: "1px solid var(--color-line)",
              boxShadow: "var(--shadow-card)",
            }}
            formatter={(value, name) => [
              String(value ?? ""),
              name === "detections" ? "זיהויים" : "תיקונים",
            ]}
          />
          <Bar dataKey="detections" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {data.map((entry) => (
              <Cell key={entry.label} fill="var(--color-brand-400)" />
            ))}
          </Bar>
          <Bar dataKey="corrections" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {data.map((entry) => (
              <Cell key={entry.label} fill="var(--color-warning-400)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
