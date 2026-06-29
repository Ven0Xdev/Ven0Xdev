"use client";

import { useState } from "react";
import Link from "next/link";
import PlanView from "@/components/PlanView";
import { savePlan } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import type {
  GymPlan,
  Goal,
  Level,
  OnboardingInput,
  Place,
} from "@/lib/types";

const goals: { value: Goal; label: string }[] = [
  { value: "cut", label: "חיטוב" },
  { value: "mass", label: "מסה" },
  { value: "strength", label: "כוח" },
];

const places: { value: Place; label: string }[] = [
  { value: "home", label: "בית" },
  { value: "gym", label: "חדר כושר" },
];

const levels: { value: Level; label: string }[] = [
  { value: "beginner", label: "מתחיל" },
  { value: "intermediate", label: "בינוני" },
  { value: "advanced", label: "מתקדם" },
];

const initialForm: OnboardingInput = {
  age: 25,
  heightCm: 175,
  weightKg: 75,
  goal: "mass",
  daysPerWeek: 3,
  place: "gym",
  level: "beginner",
  injuries: "",
  foodLikes: "",
  foodDislikes: "",
  budget: "",
};

export default function OnboardingPage() {
  const [form, setForm] = useState<OnboardingInput>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<GymPlan | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof OnboardingInput>(
    key: K,
    value: OnboardingInput[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPlan(null);
    setSaved(false);

    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "יצירת התוכנית נכשלה.");

      setPlan(data.plan as GymPlan);

      // שמירת התוכנית (Supabase אם מוגדר, אחרת מקומית)
      try {
        await savePlan(form, data.plan as GymPlan);
        setSaved(true);
      } catch {
        // השמירה נכשלה אבל התוכנית עדיין מוצגת
        setSaved(false);
      }

      // גלילה לתוצאה
      setTimeout(
        () =>
          document
            .getElementById("plan-result")
            ?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא ידועה.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="text-sm text-slate-400 hover:text-white">
        ← דף הבית
      </Link>

      <h1 className="mt-4 text-3xl font-extrabold">השאלון האישי</h1>
      <p className="mt-2 text-slate-400">
        מלאו את הפרטים ולחצו על "צור תוכנית". ככל שתפרטו יותר — התוכנית מדויקת
        יותר.
      </p>

      <form onSubmit={handleGenerate} className="card mt-6 space-y-6">
        {/* מספרים בסיסיים */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label">גיל</label>
            <input
              type="number"
              min={12}
              max={100}
              required
              className="field-input"
              value={form.age}
              onChange={(e) => update("age", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="field-label">גובה (ס"מ)</label>
            <input
              type="number"
              min={120}
              max={230}
              required
              className="field-input"
              value={form.heightCm}
              onChange={(e) => update("heightCm", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="field-label">משקל (ק"ג)</label>
            <input
              type="number"
              min={30}
              max={250}
              required
              className="field-input"
              value={form.weightKg}
              onChange={(e) => update("weightKg", Number(e.target.value))}
            />
          </div>
        </div>

        {/* מטרה */}
        <div>
          <span className="field-label">מטרה</span>
          <div className="grid grid-cols-3 gap-2">
            {goals.map((g) => (
              <button
                key={g.value}
                type="button"
                className={`chip ${form.goal === g.value ? "chip-active" : ""}`}
                onClick={() => update("goal", g.value)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* תדירות */}
        <div>
          <label className="field-label">
            כמה פעמים בשבוע מתאמנים? ({form.daysPerWeek})
          </label>
          <input
            type="range"
            min={1}
            max={7}
            className="w-full accent-brand-500"
            value={form.daysPerWeek}
            onChange={(e) => update("daysPerWeek", Number(e.target.value))}
          />
        </div>

        {/* מיקום */}
        <div>
          <span className="field-label">איפה מתאמנים?</span>
          <div className="grid grid-cols-2 gap-2">
            {places.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`chip ${form.place === p.value ? "chip-active" : ""}`}
                onClick={() => update("place", p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* רמת ניסיון */}
        <div>
          <span className="field-label">רמת ניסיון</span>
          <div className="grid grid-cols-3 gap-2">
            {levels.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`chip ${form.level === l.value ? "chip-active" : ""}`}
                onClick={() => update("level", l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* טקסט חופשי */}
        <div>
          <label className="field-label">פציעות או מגבלות</label>
          <textarea
            rows={2}
            className="field-input"
            placeholder="למשל: כאב בברך, בעיית גב תחתון... (אפשר להשאיר ריק)"
            value={form.injuries}
            onChange={(e) => update("injuries", e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">מאכלים שאוהב</label>
            <input
              className="field-input"
              placeholder="עוף, אורז, בננה..."
              value={form.foodLikes}
              onChange={(e) => update("foodLikes", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">מאכלים שלא אוהב</label>
            <input
              className="field-input"
              placeholder="דגים, ברוקולי..."
              value={form.foodDislikes}
              onChange={(e) => update("foodDislikes", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="field-label">תקציב לתזונה (אופציונלי)</label>
          <input
            className="field-input"
            placeholder="למשל: תקציב נמוך / בינוני"
            value={form.budget}
            onChange={(e) => update("budget", e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "בונה את התוכנית..." : "✨ צור תוכנית"}
        </button>
      </form>

      {plan && (
        <div id="plan-result" className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold">התוכנית שלך</h2>
            {saved && (
              <span className="text-sm text-emerald-300">
                ✓ נשמר{isSupabaseConfigured ? "" : " (מקומית)"}
              </span>
            )}
          </div>
          <PlanView plan={plan} />
        </div>
      )}
    </main>
  );
}
