"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signInWithPassword } from "./actions";

export function PasswordSignInForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      action={(formData) =>
        startTransition(async () => {
          const result = await signInWithPassword(formData);
          if (result?.error) setError(result.error);
        })
      }
    >
      <div>
        <Label htmlFor="login-email">דואר אלקטרוני</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          className="mt-1.5"
          placeholder="name@example.com"
        />
      </div>

      <div>
        <Label htmlFor="login-password">סיסמה</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5"
        />
      </div>

      {error ? (
        <p role="alert" className="text-[12px] leading-5 text-danger-600">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={isPending}>
        <KeyRound />
        {isPending ? "מתחבר..." : "כניסה"}
      </Button>
    </form>
  );
}
