"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  changeMemberRoleAction,
  createMemberAction,
  createOrganizationAction,
  type AdminActionResult,
} from "@/server/actions/admin";
import { ORGANIZATION_TYPE_LABELS, USER_ROLE_LABELS } from "@/lib/i18n/he";
import type { UserRole } from "@prisma/client";

const ORGANIZATION_TYPES = [
  "DEVELOPER",
  "CONTRACTOR",
  "TENANT_CHANGE_SERVICE",
  "ARCHITECTURE_FIRM",
  "CONSULTANT_FIRM",
] as const;

const fieldClass =
  "h-9 w-full rounded-control border border-line bg-surface px-3 text-[13px] text-ink";

function Feedback({ state }: { state: AdminActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`text-[13px] ${state.ok ? "text-success-600" : "text-danger-600"}`}
    >
      {state.message}
      {state.problems?.length ? ` ${state.problems.join(" ")}` : null}
    </p>
  );
}

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    createOrganizationAction,
    null,
  );

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Input name="name" placeholder="שם הארגון" required aria-label="שם הארגון" />
      <select name="type" className={fieldClass} aria-label="סוג הארגון" defaultValue="CONTRACTOR">
        {ORGANIZATION_TYPES.map((type) => (
          <option key={type} value={type}>
            {ORGANIZATION_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <Input name="legalName" placeholder="שם משפטי (רשות)" aria-label="שם משפטי" />
      <Input name="city" placeholder="עיר (רשות)" aria-label="עיר" />
      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "יוצר…" : "יצירת ארגון"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function CreateMemberForm({
  organizations,
  assignableRoles,
}: {
  organizations: { id: string; name: string }[];
  assignableRoles: UserRole[];
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    createMemberAction,
    null,
  );

  if (organizations.length === 0) {
    return <p className="text-[13px] text-ink-muted">יש ליצור ארגון לפני הוספת משתמשים.</p>;
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Input name="name" placeholder="שם מלא" required aria-label="שם מלא" />
      <Input
        name="email"
        type="email"
        placeholder="דואר אלקטרוני"
        required
        aria-label="דואר אלקטרוני"
      />
      <Input
        name="password"
        type="password"
        placeholder="סיסמה ראשונית"
        required
        autoComplete="new-password"
        aria-label="סיסמה ראשונית"
      />
      <Input name="jobTitle" placeholder="תפקיד בארגון (רשות)" aria-label="תפקיד בארגון" />
      <select name="organizationId" className={fieldClass} aria-label="ארגון">
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
      <select name="role" className={fieldClass} aria-label="תפקיד" defaultValue="ORGANIZATION_ADMIN">
        {assignableRoles.map((role) => (
          <option key={role} value={role}>
            {USER_ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "יוצר…" : "יצירת משתמש"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ChangeRoleForm({
  membershipId,
  currentRole,
  assignableRoles,
}: {
  membershipId: string;
  currentRole: UserRole;
  assignableRoles: UserRole[];
}) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    changeMemberRoleAction,
    null,
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <select
        name="role"
        className="h-8 rounded-control border border-line bg-surface px-2 text-[12px] text-ink"
        defaultValue={currentRole}
        aria-label="שינוי תפקיד"
      >
        {assignableRoles.map((role) => (
          <option key={role} value={role}>
            {USER_ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        עדכון
      </Button>
      {state && !state.ok ? (
        <span className="text-[12px] text-danger-600">{state.message}</span>
      ) : null}
    </form>
  );
}
