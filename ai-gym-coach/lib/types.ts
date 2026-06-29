// טיפוסים משותפים לכל האפליקציה

export type Goal = "cut" | "mass" | "strength";
export type Place = "home" | "gym";
export type Level = "beginner" | "intermediate" | "advanced";

/** מה שהמשתמש ממלא בשאלון */
export interface OnboardingInput {
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  daysPerWeek: number;
  place: Place;
  level: Level;
  injuries: string;
  foodLikes: string;
  foodDislikes: string;
  budget?: string;
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string; // "8-12" וכו'
  notes?: string;
}

export interface WorkoutDay {
  day: string; // "יום א' – חזה וטרייספס"
  focus: string;
  exercises: Exercise[];
}

export interface Meal {
  name: string; // "ארוחת בוקר"
  items: string[];
  approxCalories: number;
  approxProtein: number;
}

/** מה שה-AI מחזיר */
export interface GymPlan {
  summary: string;
  caloriesTarget: number;
  proteinTargetGrams: number;
  workoutPlan: WorkoutDay[];
  exampleMealPlan: Meal[];
  progressTips: string[];
  dailyMotivation: string;
  safetyNote: string;
}

export interface SavedPlan {
  id: string;
  createdAt: string;
  input: OnboardingInput;
  plan: GymPlan;
}
