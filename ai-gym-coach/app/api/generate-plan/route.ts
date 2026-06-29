import { NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompt";
import type { GymPlan, OnboardingInput } from "@/lib/types";

export const runtime = "nodejs";

function isValidInput(b: unknown): b is OnboardingInput {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.age === "number" &&
    typeof o.heightCm === "number" &&
    typeof o.weightKg === "number" &&
    typeof o.daysPerWeek === "number" &&
    typeof o.goal === "string" &&
    typeof o.place === "string" &&
    typeof o.level === "string"
  );
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "השרת לא מוגדר: חסר OPENAI_API_KEY. ראו .env.example." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין." }, { status: 400 });
  }

  if (!isValidInput(body)) {
    return NextResponse.json(
      { error: "נתוני השאלון חסרים או לא תקינים." },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body) },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json(
        { error: "ה-AI לא החזיר תשובה. נסו שוב." },
        { status: 502 }
      );
    }

    const plan = JSON.parse(raw) as GymPlan;
    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return NextResponse.json(
      { error: `יצירת התוכנית נכשלה: ${message}` },
      { status: 502 }
    );
  }
}
