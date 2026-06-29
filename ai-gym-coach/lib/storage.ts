"use client";

import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { GymPlan, OnboardingInput, SavedPlan } from "./types";

const LOCAL_KEY = "ai-gym-coach:plans";

function readLocal(): SavedPlan[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(plans: SavedPlan[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(plans));
}

/**
 * שמירת תוכנית. אם Supabase מוגדר – נשמר בטבלת `plans`,
 * אחרת נשמר ב-localStorage כדי שה-MVP יעבוד מיד ללא הגדרות.
 *
 * סכמת הטבלה ב-Supabase:
 *   create table plans (
 *     id uuid primary key default gen_random_uuid(),
 *     created_at timestamptz default now(),
 *     input jsonb not null,
 *     plan jsonb not null
 *   );
 */
export async function savePlan(
  input: OnboardingInput,
  plan: GymPlan
): Promise<SavedPlan> {
  const saved: SavedPlan = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    input,
    plan,
  };

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("plans")
        .insert({ input, plan })
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (data) {
        return {
          id: data.id,
          createdAt: data.created_at,
          input: data.input,
          plan: data.plan,
        };
      }
    }
  }

  const plans = readLocal();
  plans.unshift(saved);
  writeLocal(plans);
  return saved;
}

/** שליפת התוכנית האחרונה (לתצוגה בדאשבורד/דף הבית בעתיד) */
export async function getLatestPlan(): Promise<SavedPlan | null> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase
        .from("plans")
        .select()
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        return {
          id: data.id,
          createdAt: data.created_at,
          input: data.input,
          plan: data.plan,
        };
      }
      return null;
    }
  }
  return readLocal()[0] || null;
}
