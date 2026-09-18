import type {
  ApartmentStatus,
  ChangeCategoryKey,
  ChangeItemStatus,
  ChangeType,
  ConsultantKind,
  RuleSeverity,
} from "@prisma/client";
import type { DrawingDocument } from "@/lib/drawing/types";

export interface RuleHitView {
  ruleKey: string;
  message: string;
  severity: RuleSeverity;
}

export interface ChangeCommentView {
  id: string;
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface ChangeItemView {
  id: string;
  code: string;
  type: ChangeType;
  categoryKey: ChangeCategoryKey;
  status: ChangeItemStatus;
  description: string;
  roomLabel: string | null;
  elementId: string | null;
  elementType: string;
  confidence: number;
  quantity: number;
  unit: string;
  requiresConsultant: boolean;
  consultantKind: ConsultantKind | null;
  blockedFromAutomation: boolean;
  ruleHits: RuleHitView[];
  decidedByName: string | null;
  decidedAt: Date | null;
  notes: string | null;
  comments: ChangeCommentView[];
  consultantRequest: {
    id: string;
    code: string;
    status: string;
    decision: string | null;
    conditions: string | null;
  } | null;
}

export interface ConsultantOption {
  id: string;
  name: string;
  role: string;
  kind: ConsultantKind;
}

export interface WorkspacePermissions {
  canDecide: boolean;
  canComment: boolean;
  canSendToConsultant: boolean;
  canManagePricing: boolean;
  canRespondAsConsultant: boolean;
  canReleaseExecution: boolean;
  isDemoEnvironment: boolean;
}

export interface ApartmentHeaderInfo {
  id: string;
  number: string;
  buildingName: string;
  floorNumber: number;
  status: ApartmentStatus;
  buyerName: string | null;
  buyerContact: string | null;
  apartmentTypeName: string | null;
  managerName: string | null;
  coordinatorName: string | null;
  dueDate: Date | null;
  projectId: string;
  projectName: string;
  currentVersionLabel: string;
}

export interface PlanDocuments {
  standard: DrawingDocument | null;
  modified: DrawingDocument | null;
}
