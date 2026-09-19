import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { AppShell } from "@/components/shell/app-shell";
import { getCurrentUser, primaryRole } from "@/lib/auth/session";
import { isTenantRole } from "@/lib/auth/permissions";
import { USER_ROLE_LABELS } from "@/lib/i18n/he";
import { getUnreadNotifications, getWorkloadCounts } from "@/server/queries/workload";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // דייר מנותב לאזור האישי שלו ואינו רואה את הממשק המקצועי
  if (!user.isSuperAdmin && isTenantRole(primaryRole(user))) {
    redirect("/tenant");
  }

  const [counts, notifications] = await Promise.all([
    getWorkloadCounts(user),
    getUnreadNotifications(user.id),
  ]);

  const role = primaryRole(user);

  return (
    <AppShell
      user={{
        name: user.name,
        image: user.image,
        role: role ? USER_ROLE_LABELS[role] : "משתמש",
        organization: user.primaryMembership?.organization.name ?? "—",
      }}
      counts={{
        reviews: counts.awaitingReview,
        consultants: counts.consultantRequestsPending,
        pricing: counts.awaitingPricing,
        myWork: counts.openAssignments,
      }}
      notifications={notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        createdAt: notification.createdAt.toISOString(),
        isRead: Boolean(notification.readAt),
      }))}
    >
      {children}
      <Toaster dir="rtl" position="top-center" richColors closeButton />
    </AppShell>
  );
}
