import type { GymPlan } from "@/lib/types";

export default function PlanView({ plan }: { plan: GymPlan }) {
  return (
    <div className="space-y-6">
      {/* מוטיבציה + סיכום */}
      <div className="card border-brand-500/30 bg-brand-500/10">
        <p className="text-sm font-semibold text-brand-200">המוטיבציה היומית</p>
        <p className="mt-1 text-lg font-bold">{plan.dailyMotivation}</p>
        {plan.summary && (
          <p className="mt-3 text-sm text-slate-300">{plan.summary}</p>
        )}
      </div>

      {/* יעדים */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card text-center">
          <p className="text-sm text-slate-400">יעד קלוריות יומי</p>
          <p className="mt-1 text-3xl font-extrabold text-brand-400">
            {plan.caloriesTarget.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">קלוריות</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-slate-400">יעד חלבון יומי</p>
          <p className="mt-1 text-3xl font-extrabold text-brand-400">
            {plan.proteinTargetGrams}
          </p>
          <p className="text-xs text-slate-500">גרם</p>
        </div>
      </div>

      {/* תוכנית אימונים */}
      <section>
        <h2 className="mb-3 text-xl font-bold">תוכנית אימונים שבועית</h2>
        <div className="space-y-4">
          {plan.workoutPlan.map((day, i) => (
            <div key={i} className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">{day.day}</h3>
                <span className="text-sm text-brand-300">{day.focus}</span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="text-slate-400">
                    <tr className="border-b border-white/10">
                      <th className="py-2 font-medium">תרגיל</th>
                      <th className="py-2 font-medium">סטים</th>
                      <th className="py-2 font-medium">חזרות</th>
                      <th className="py-2 font-medium">הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.exercises.map((ex, j) => (
                      <tr key={j} className="border-b border-white/5 last:border-0">
                        <td className="py-2 font-medium">{ex.name}</td>
                        <td className="py-2">{ex.sets}</td>
                        <td className="py-2">{ex.reps}</td>
                        <td className="py-2 text-slate-400">{ex.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* תפריט יומי */}
      <section>
        <h2 className="mb-3 text-xl font-bold">תפריט יומי לדוגמה</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {plan.exampleMealPlan.map((meal, i) => (
            <div key={i} className="card">
              <div className="flex items-baseline justify-between">
                <h3 className="font-bold">{meal.name}</h3>
                <span className="text-xs text-slate-400">
                  ~{meal.approxCalories} קל' · {meal.approxProtein} ג' חלבון
                </span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pr-5 text-sm text-slate-300">
                {meal.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* טיפים */}
      <section className="card">
        <h2 className="mb-3 text-xl font-bold">טיפים להתקדמות</h2>
        <ul className="list-disc space-y-2 pr-5 text-sm text-slate-300">
          {plan.progressTips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </section>

      {/* הערת בטיחות */}
      {plan.safetyNote && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          ⚠️ {plan.safetyNote}
        </p>
      )}
    </div>
  );
}
