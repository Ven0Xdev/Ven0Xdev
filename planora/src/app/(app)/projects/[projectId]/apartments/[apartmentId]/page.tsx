import type { Metadata } from "next";
import { Suspense } from "react";

import { ApartmentWorkspace, type WorkspaceTab } from "@/components/apartment/workspace";
import { ApprovalsPanel } from "@/components/apartment/approvals-panel";
import { SelectionsPanel } from "@/components/apartment/selections-panel";
import { ChangesPanel } from "@/components/apartment/changes-panel";
import { ConsultantsPanel } from "@/components/apartment/consultants-panel";
import { HistoryPanel } from "@/components/apartment/history-panel";
import { OverviewPanel } from "@/components/apartment/overview-panel";
import { PlansPanel, type PlanVersionView } from "@/components/apartment/plans-panel";
import { PricingPanel } from "@/components/apartment/pricing-panel";
import { ReviewPanel } from "@/components/apartment/review-panel";
import type { ChangeItemView, ConsultantOption, WorkspacePermissions } from "@/components/apartment/types";
import { Skeleton } from "@/components/ui/misc";
import { can, canDecideSelections, isConsultantRole } from "@/lib/auth/permissions";
import { requireApartmentAccess } from "@/lib/auth/session";
import type { DrawingDocument } from "@/lib/drawing/types";
import { APARTMENT_TABS, USER_ROLE_LABELS } from "@/lib/i18n/he";
import { env } from "@/lib/env";
import { getApartmentWorkspace } from "@/server/queries/apartment";
import type { ConsultantKind } from "@prisma/client";

const ROLE_TO_KIND: Record<string, ConsultantKind> = {
  PLUMBING_CONSULTANT: "PLUMBING",
  HVAC_CONSULTANT: "HVAC",
  ELECTRICAL_CONSULTANT: "ELECTRICAL",
  STRUCTURAL_CONSULTANT: "STRUCTURAL",
  ARCHITECT: "ARCHITECT",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ apartmentId: string }>;
}): Promise<Metadata> {
  const { apartmentId } = await params;
  const { apartment } = await getApartmentWorkspace(apartmentId);
  return { title: `דירה ${apartment.number}` };
}

export default async function ApartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; apartmentId: string }>;
  searchParams: Promise<{ tab?: string; change?: string }>;
}) {
  const { apartmentId } = await params;
  const { change: selectedChangeId } = await searchParams;

  const { role } = await requireApartmentAccess(apartmentId);
  const { apartment, changeSet, professionalDecisions, consultants } =
    await getApartmentWorkspace(apartmentId);

  const permissions: WorkspacePermissions = {
    canDecide: can(role, "change:decide"),
    canComment: can(role, "change:comment"),
    canSendToConsultant: can(role, "change:sendToConsultant"),
    canManagePricing: can(role, "pricing:manage"),
    canRespondAsConsultant: isConsultantRole(role) || role === "SUPER_ADMIN",
    canReleaseExecution: can(role, "execution:release"),
    isDemoEnvironment: env.demoLoginEnabled,
  };

  // ---- תוכניות וגרסאות ----
  const versions: PlanVersionView[] = apartment.plans
    .flatMap((plan) =>
      plan.versions.map((version) => ({
        id: version.id,
        versionNo: version.versionNo,
        title: version.title,
        status: version.status,
        planKind: plan.kind,
        notes: version.notes,
        authorName: version.author?.name ?? null,
        createdAt: version.createdAt,
        isCurrent: version.isCurrent,
        document: (version.elements as unknown as DrawingDocument | null) ?? null,
        files: version.drawingFiles.map((file) => ({
          id: file.id,
          originalName: file.originalName,
          kind: file.kind,
        })),
      })),
    )
    .sort((a, b) => a.versionNo - b.versionNo);

  const standardDocument =
    versions.find((version) => version.planKind === "STANDARD")?.document ?? null;
  const modifiedDocument =
    versions
      .filter((version) => version.planKind === "MODIFIED")
      .sort((a, b) => b.versionNo - a.versionNo)[0]?.document ?? null;

  const currentVersion = versions.find((version) => version.isCurrent) ?? versions.at(-1);

  // ---- שינויים ----
  const changes: ChangeItemView[] = (changeSet?.items ?? []).map((item) => {
    const request = item.consultantRequests[0];
    const response = request?.responses[0];

    return {
      id: item.id,
      code: item.code,
      type: item.type,
      categoryKey: item.categoryKey,
      status: item.status,
      description: item.description,
      roomLabel: item.roomLabel,
      elementId: item.elementId,
      elementType: item.elementType,
      confidence: item.confidence,
      quantity: item.quantity,
      unit: item.unit,
      requiresConsultant: item.requiresConsultant,
      consultantKind: item.consultantKind,
      blockedFromAutomation: item.blockedFromAutomation,
      ruleHits: item.ruleHits.map((hit) => ({
        ruleKey: hit.ruleKey,
        message: hit.message,
        severity: hit.severity,
      })),
      decidedByName: item.decidedBy?.name ?? null,
      decidedAt: item.decidedAt,
      notes: item.notes,
      comments: item.reviewComments.map((comment) => ({
        id: comment.id,
        authorName: comment.author.name ?? "משתמש",
        body: comment.body,
        createdAt: comment.createdAt,
      })),
      consultantRequest: request
        ? {
            id: request.id,
            code: request.code,
            status: request.status,
            decision: response?.decision ?? null,
            conditions: response?.conditions ?? null,
          }
        : null,
    };
  });

  const consultantOptions: ConsultantOption[] = consultants.map((member) => ({
    id: member.user.id,
    name: member.user.name ?? "יועץ",
    role: USER_ROLE_LABELS[member.role],
    kind: ROLE_TO_KIND[member.role] ?? "OTHER",
  }));

  const pendingCount = changes.filter((change) => change.status === "DETECTED").length;
  const pendingConsultantCount = apartment.consultantRequests.filter(
    (request) => request.status === "PENDING",
  ).length;

  const activeSheet = apartment.pricingSheets[0] ?? null;
  const configuration = apartment.configurations[0] ?? null;
  const pendingSelections = (configuration?.selections ?? []).filter((selection) =>
    ["REQUESTED", "UNDER_REVIEW"].includes(selection.status),
  ).length;
  const openTenantRequests =
    apartment.changeRequests.filter((request) =>
      ["SUBMITTED", "UNDER_REVIEW", "REQUIRES_CONSULTANT"].includes(request.status),
    ).length +
    apartment.exceptionRequests.filter((request) =>
      ["SUBMITTED", "UNDER_REVIEW", "SENT_TO_SUPPLIER", "MORE_INFO_REQUIRED"].includes(
        request.status,
      ),
    ).length;

  const tabs: WorkspaceTab[] = [
    {
      key: "overview",
      label: APARTMENT_TABS.overview,
      content: (
        <OverviewPanel
          documents={{ standard: standardDocument, modified: modifiedDocument }}
          changes={changes}
          apartment={{
            buyerName: apartment.buyerName,
            buyerContact: apartment.buyerContact,
            apartmentTypeName: apartment.apartmentType?.name ?? null,
            managerName: apartment.assignedManager?.name ?? null,
            coordinatorName: apartment.assignedCoordinator?.name ?? null,
            dueDate: apartment.dueDate,
            projectName: apartment.project.name,
            developerName: apartment.project.developerName,
            contractorName: apartment.project.contractorName,
          }}
        />
      ),
    },
    {
      key: "plans",
      label: APARTMENT_TABS.plans,
      content: <PlansPanel versions={versions} />,
      badge: versions.length,
    },
    {
      key: "changes",
      label: APARTMENT_TABS.changes,
      content: (
        <ChangesPanel
          documents={{ standard: standardDocument, modified: modifiedDocument }}
          changes={changes}
          permissions={permissions}
          consultants={consultantOptions}
          initialSelectedId={selectedChangeId ?? null}
        />
      ),
      badge: changes.length,
    },
    {
      key: "review",
      label: APARTMENT_TABS.review,
      content: (
        <ReviewPanel
          apartmentId={apartment.id}
          changes={changes}
          permissions={permissions}
          reviews={apartment.reviews.map((review) => ({
            id: review.id,
            status: review.status,
            summary: review.summary,
            reviewerName: review.reviewer?.name ?? null,
            startedAt: review.startedAt,
            completedAt: review.completedAt,
            comments: review.comments.map((comment) => ({
              id: comment.id,
              authorName: comment.author.name ?? "משתמש",
              body: comment.body,
              createdAt: comment.createdAt,
              isCorrectionRequest: comment.isCorrectionRequest,
            })),
          }))}
        />
      ),
      badge: pendingCount,
    },
    {
      key: "pricing",
      label: APARTMENT_TABS.pricing,
      content: (
        <PricingPanel
          apartmentId={apartment.id}
          permissions={permissions}
          hasApprovedChanges={changes.some((change) =>
            ["CONFIRMED", "CONSULTANT_APPROVED", "CONSULTANT_CONDITIONAL", "PRICED"].includes(
              change.status,
            ),
          )}
          sheet={
            activeSheet
              ? {
                  id: activeSheet.id,
                  status: activeSheet.status,
                  discount: activeSheet.discount,
                  vatRate: activeSheet.vatRate,
                  notes: activeSheet.notes,
                  ownerName: activeSheet.owner?.name ?? null,
                  sentAt: activeSheet.sentAt,
                  approvedAt: activeSheet.approvedAt,
                  paidAt: activeSheet.paidAt,
                  lines: activeSheet.lines.map((line) => ({
                    id: line.id,
                    description: line.description,
                    quantity: line.quantity,
                    unit: line.unit,
                    unitPrice: line.unitPrice,
                    source: line.source,
                    changeReason: line.changeReason,
                  })),
                }
              : null
          }
        />
      ),
    },
    {
      key: "selections",
      label: "בחירות דייר",
      badge: pendingSelections + openTenantRequests,
      content: (
        <SelectionsPanel
          apartmentId={apartment.id}
          canDecide={canDecideSelections(role)}
          canHandleRequests={can(role, "request:handle")}
          configurationStatus={configuration?.status ?? null}
          configurationLabel={configuration?.label ?? null}
          selections={(configuration?.selections ?? []).map((selection) => ({
            id: selection.id,
            productName: selection.product.name,
            supplierName: selection.product.supplier.name,
            variantName: selection.variant?.name ?? null,
            category: selection.category,
            price: selection.price,
            quantity: selection.quantity,
            status: selection.status,
            requiresApproval: selection.requiresApproval,
            requiresConsultant: selection.requiresConsultant,
            isMajorChange: selection.isMajorChange,
            selectedAt: selection.selectedAt,
          }))}
          changeRequests={apartment.changeRequests.map((request) => ({
            id: request.id,
            code: request.code,
            title: request.title,
            description: request.description,
            category: request.category,
            status: request.status,
            createdAt: request.createdAt,
            estimatedPrice: request.estimatedPrice,
          }))}
          exceptionRequests={apartment.exceptionRequests.map((request) => ({
            id: request.id,
            code: request.code,
            title: request.title,
            description: request.description,
            category: request.category,
            status: request.status,
            createdAt: request.createdAt,
            referenceUrl: request.referenceUrl,
          }))}
        />
      ),
    },
    {
      key: "consultants",
      label: APARTMENT_TABS.consultants,
      content: (
        <ConsultantsPanel
          permissions={permissions}
          requests={apartment.consultantRequests.map((request) => ({
            id: request.id,
            code: request.code,
            kind: request.kind,
            status: request.status,
            question: request.question,
            dueDate: request.dueDate,
            createdAt: request.createdAt,
            requestedByName: request.requestedBy.name ?? "משתמש",
            assigneeName: request.assignee?.name ?? null,
            changeCode: request.changeItem?.code ?? null,
            changeDescription: request.changeItem?.description ?? null,
            responses: request.responses.map((response) => ({
              id: response.id,
              decision: response.decision,
              conditions: response.conditions,
              notes: response.notes,
              responderName: response.responder.name ?? "יועץ",
              createdAt: response.createdAt,
            })),
          }))}
        />
      ),
      badge: pendingConsultantCount,
    },
    {
      key: "approvals",
      label: APARTMENT_TABS.approvals,
      content: (
        <ApprovalsPanel
          apartmentId={apartment.id}
          canRelease={permissions.canReleaseExecution}
          isPaid={apartment.status === "PAID"}
          approvals={apartment.approvals.map((approval) => ({
            id: approval.id,
            kind: approval.kind,
            status: approval.status,
            grantedByName: null,
            grantedAt: approval.grantedAt,
            notes: approval.notes,
          }))}
          decisions={professionalDecisions.map((decision) => ({
            id: decision.id,
            kind: decision.kind,
            decision: decision.decision,
            notes: decision.notes,
            userName: decision.user.name ?? "משתמש",
            role: decision.role,
            createdAt: decision.createdAt,
          }))}
        />
      ),
    },
    {
      key: "history",
      label: APARTMENT_TABS.history,
      content: (
        <HistoryPanel
          activities={apartment.activities.map((activity) => ({
            id: activity.id,
            kind: activity.kind,
            message: activity.message,
            userName: activity.user?.name ?? null,
            createdAt: activity.createdAt,
          }))}
        />
      ),
    },
  ];

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ApartmentWorkspace
        header={{
          id: apartment.id,
          number: apartment.number,
          buildingName: apartment.building.name,
          floorNumber: apartment.floor.number,
          status: apartment.status,
          buyerName: apartment.buyerName,
          buyerContact: apartment.buyerContact,
          apartmentTypeName: apartment.apartmentType?.name ?? null,
          managerName: apartment.assignedManager?.name ?? null,
          coordinatorName: apartment.assignedCoordinator?.name ?? null,
          dueDate: apartment.dueDate,
          projectId: apartment.projectId,
          projectName: apartment.project.name,
          currentVersionLabel: currentVersion
            ? `v${currentVersion.versionNo} · ${currentVersion.title}`
            : "—",
        }}
        tabs={tabs}
        tenantName={apartment.tenantUser?.name ?? null}
      />
    </Suspense>
  );
}
