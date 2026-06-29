import type { OnboardingInput } from "./types";

const goalText: Record<OnboardingInput["goal"], string> = {
  cut: "חיטוב (ירידה באחוז שומן תוך שמירה על מסת שריר)",
  mass: "עלייה במסת שריר",
  strength: "כוח",
};

const placeText: Record<OnboardingInput["place"], string> = {
  home: "בבית (משקל גוף / ציוד בסיסי)",
  gym: "חדר כושר מאובזר",
};

const levelText: Record<OnboardingInput["level"], string> = {
  beginner: "מתחיל",
  intermediate: "בינוני",
  advanced: "מתקדם",
};

/** הנחיית המערכת – קובעת את ההתנהגות וגם את מבנה ה-JSON שמוחזר */
export const SYSTEM_PROMPT = `You are an AI fitness coach.
Create a safe and realistic workout and nutrition plan.

Use the user's: age, height, weight, goal, training level, equipment,
weekly availability, injuries, food preferences, and budget.

Rules:
- Do not give medical advice.
- If the user has injuries, recommend seeing a professional and adapt the plan conservatively.
- Keep the plan realistic and achievable for the stated level and weekly availability.
- Explain everything simply.
- Respect food likes/dislikes and budget in the meal plan.

Write ALL text content in Hebrew.

Return ONLY a valid JSON object (no markdown fences) with EXACTLY this shape:
{
  "summary": string,
  "caloriesTarget": number,
  "proteinTargetGrams": number,
  "workoutPlan": [
    { "day": string, "focus": string,
      "exercises": [ { "name": string, "sets": number, "reps": string, "notes": string } ] }
  ],
  "exampleMealPlan": [
    { "name": string, "items": [string], "approxCalories": number, "approxProtein": number }
  ],
  "progressTips": [string],
  "dailyMotivation": string,
  "safetyNote": string
}
The number of workout days must match the user's weekly availability.`;

/** בונה את הודעת המשתמש מתוך נתוני השאלון */
export function buildUserPrompt(input: OnboardingInput): string {
  return [
    `גיל: ${input.age}`,
    `גובה: ${input.heightCm} ס"מ`,
    `משקל: ${input.weightKg} ק"ג`,
    `מטרה: ${goalText[input.goal]}`,
    `תדירות אימון: ${input.daysPerWeek} פעמים בשבוע`,
    `מיקום אימון: ${placeText[input.place]}`,
    `רמת ניסיון: ${levelText[input.level]}`,
    `פציעות / מגבלות: ${input.injuries.trim() || "אין"}`,
    `מאכלים שאוהב: ${input.foodLikes.trim() || "לא צוין"}`,
    `מאכלים שלא אוהב: ${input.foodDislikes.trim() || "לא צוין"}`,
    `תקציב: ${input.budget?.trim() || "לא צוין"}`,
  ].join("\n");
}
