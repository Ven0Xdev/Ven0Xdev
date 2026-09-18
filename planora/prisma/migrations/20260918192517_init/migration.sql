-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'PROJECT_MANAGER', 'TENANT_CHANGE_MANAGER', 'TENANT_CHANGE_COORDINATOR', 'ARCHITECT', 'DESIGNER', 'BIM_MANAGER', 'HVAC_CONSULTANT', 'PLUMBING_CONSULTANT', 'ELECTRICAL_CONSULTANT', 'STRUCTURAL_CONSULTANT', 'PRICING_MANAGER', 'TENANT', 'FINANCE');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('DEVELOPER', 'CONTRACTOR', 'TENANT_CHANGE_SERVICE', 'ARCHITECTURE_FIRM', 'CONSULTANT_FIRM');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'TENANT_CHANGES', 'EXECUTION', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApartmentStatus" AS ENUM ('STANDARD', 'CHANGES_IN_PROGRESS', 'AWAITING_REVIEW', 'NEEDS_CORRECTION', 'AWAITING_CONSULTANT', 'AWAITING_PRICING', 'AWAITING_TENANT_APPROVAL', 'AWAITING_PAYMENT', 'PAID', 'APPROVED_FOR_EXECUTION');

-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('STANDARD', 'MODIFIED');

-- CreateEnum
CREATE TYPE "PlanVersionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_CORRECTION', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('PDF', 'DWG', 'DXF', 'RVT', 'IFC', 'IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('ADDED', 'REMOVED', 'MOVED', 'MODIFIED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ChangeCategoryKey" AS ENUM ('ELECTRICAL', 'LIGHTING', 'WALL', 'DOOR', 'WINDOW', 'PLUMBING', 'HVAC', 'KITCHEN', 'SANITARY', 'COMMUNICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ChangeItemStatus" AS ENUM ('DETECTED', 'CONFIRMED', 'DISMISSED', 'REJECTED', 'AWAITING_CONSULTANT', 'CONSULTANT_APPROVED', 'CONSULTANT_CONDITIONAL', 'CONSULTANT_REJECTED', 'PRICED');

-- CreateEnum
CREATE TYPE "ChangeSetStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'REVIEWED', 'PRICED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'RETURNED_FOR_CORRECTION');

-- CreateEnum
CREATE TYPE "ConsultantKind" AS ENUM ('PLUMBING', 'HVAC', 'ELECTRICAL', 'STRUCTURAL', 'ARCHITECT', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsultantRequestStatus" AS ENUM ('PENDING', 'ANSWERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsultantDecision" AS ENUM ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED', 'MORE_INFO_REQUIRED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('MANAGER_REVIEW', 'CONSULTANT', 'PRICING', 'TENANT', 'PAYMENT', 'EXECUTION_RELEASE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'GRANTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ProfessionalDecisionKind" AS ENUM ('CHANGE_CONFIRMED', 'CHANGE_REJECTED', 'CHANGE_DISMISSED', 'CLASSIFICATION_CORRECTED', 'SENT_TO_CONSULTANT', 'CONSULTANT_DECISION', 'PLAN_RETURNED_FOR_CORRECTION', 'PLAN_APPROVED', 'PRICING_APPROVED', 'RELEASED_FOR_EXECUTION');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('PLAN_REVIEW', 'CORRECTION', 'CONSULTANT_REVIEW', 'PRICING', 'TENANT_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PricingLineSource" AS ENUM ('AUTOMATIC', 'MANUAL', 'EDITED');

-- CreateEnum
CREATE TYPE "PricingSheetStatus" AS ENUM ('DRAFT', 'SENT_TO_TENANT', 'APPROVED_BY_TENANT', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VatBehavior" AS ENUM ('ADD_VAT', 'INCLUDED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "RuleEffect" AS ENUM ('REQUIRE_CONSULTANT', 'REQUIRE_MANAGER_REVIEW', 'BLOCK_AUTOMATIC_WORKFLOW', 'FLAG_FOR_ATTENTION');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('PLAN_UPLOADED', 'REVIEW_REQUIRED', 'CONSULTANT_ANSWERED', 'CONSULTANT_REQUESTED', 'CORRECTION_REQUIRED', 'READY_FOR_PRICING', 'PRICING_UPDATED', 'TENANT_APPROVED', 'PAYMENT_RECEIVED', 'RELEASED_FOR_EXECUTION', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('PROJECT_CREATED', 'APARTMENT_CREATED', 'PLAN_UPLOADED', 'VERSION_CREATED', 'ANALYSIS_COMPLETED', 'CHANGE_DETECTED', 'CHANGE_CONFIRMED', 'CHANGE_CORRECTED', 'CHANGE_DISMISSED', 'CHANGE_REJECTED', 'CONSULTANT_REQUESTED', 'CONSULTANT_ANSWERED', 'REVIEW_COMPLETED', 'CORRECTION_REQUESTED', 'PRICING_UPDATED', 'PRICING_SENT', 'TENANT_APPROVED', 'PAYMENT_RECEIVED', 'EXECUTION_RELEASED', 'RULE_TRIGGERED', 'NOTE_ADDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "type" "OrganizationType" NOT NULL,
    "taxId" TEXT,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "jobTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "developerName" TEXT,
    "contractorName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "description" TEXT,
    "tenantChangeManagerId" TEXT,
    "changeDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "floors" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentType" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rooms" DOUBLE PRECISION NOT NULL,
    "areaSqm" DOUBLE PRECISION,
    "balconies" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApartmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apartment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "apartmentTypeId" TEXT,
    "number" TEXT NOT NULL,
    "buyerName" TEXT,
    "buyerContact" TEXT,
    "status" "ApartmentStatus" NOT NULL DEFAULT 'STANDARD',
    "dueDate" TIMESTAMP(3),
    "assignedManagerId" TEXT,
    "assignedCoordinatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT,
    "apartmentTypeId" TEXT,
    "kind" "PlanKind" NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "authorId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "elements" JSONB,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingFile" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "fileId" TEXT,
    "kind" "FileKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "apartmentId" TEXT,
    "uploadedById" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "kind" "FileKind" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeCategory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "key" "ChangeCategoryKey" NOT NULL,
    "label" TEXT NOT NULL,
    "colorToken" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeSet" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "baseVersionId" TEXT NOT NULL,
    "targetVersionId" TEXT NOT NULL,
    "status" "ChangeSetStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "detectedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeItem" (
    "id" TEXT NOT NULL,
    "changeSetId" TEXT NOT NULL,
    "categoryId" TEXT,
    "code" TEXT NOT NULL,
    "type" "ChangeType" NOT NULL,
    "categoryKey" "ChangeCategoryKey" NOT NULL,
    "status" "ChangeItemStatus" NOT NULL DEFAULT 'DETECTED',
    "elementType" TEXT NOT NULL,
    "elementId" TEXT,
    "roomLabel" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'UNIT',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requiresConsultant" BOOLEAN NOT NULL DEFAULT false,
    "consultantKind" "ConsultantKind",
    "blockedFromAutomation" BOOLEAN NOT NULL DEFAULT false,
    "geometryBefore" JSONB,
    "geometryAfter" JSONB,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT,
    "changeSetId" TEXT,
    "engine" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "durationMs" INTEGER,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "averageConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITrainingCorrection" (
    "id" TEXT NOT NULL,
    "changeItemId" TEXT NOT NULL,
    "projectId" TEXT,
    "correctedById" TEXT NOT NULL,
    "predictedType" "ChangeType" NOT NULL,
    "predictedCategory" "ChangeCategoryKey" NOT NULL,
    "correctedType" "ChangeType" NOT NULL,
    "correctedCategory" "ChangeCategoryKey" NOT NULL,
    "originalConfidence" DOUBLE PRECISION NOT NULL,
    "context" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AITrainingCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "changeSetId" TEXT,
    "planVersionId" TEXT,
    "reviewerId" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "changeItemId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isCorrectionRequest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantRequest" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "changeItemId" TEXT,
    "planVersionId" TEXT,
    "code" TEXT NOT NULL,
    "kind" "ConsultantKind" NOT NULL,
    "status" "ConsultantRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "question" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "decision" "ConsultantDecision" NOT NULL,
    "conditions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultantResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalDecision" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT,
    "changeItemId" TEXT,
    "planVersionId" TEXT,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "kind" "ProfessionalDecisionKind" NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "apartmentId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" "AssignmentKind" NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "condition" JSONB NOT NULL,
    "effect" "RuleEffect" NOT NULL,
    "consultantKind" "ConsultantKind",
    "severity" "RuleSeverity" NOT NULL DEFAULT 'WARNING',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ruleId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "condition" JSONB NOT NULL,
    "effect" "RuleEffect" NOT NULL,
    "consultantKind" "ConsultantKind",
    "severity" "RuleSeverity" NOT NULL DEFAULT 'WARNING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeItemRuleHit" (
    "id" TEXT NOT NULL,
    "changeItemId" TEXT NOT NULL,
    "ruleId" TEXT,
    "projectRuleId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeItemRuleHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookItem" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryKey" "ChangeCategoryKey" NOT NULL,
    "changeType" "ChangeType",
    "unit" TEXT NOT NULL DEFAULT 'UNIT',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "vatBehavior" "VatBehavior" NOT NULL DEFAULT 'ADD_VAT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSheet" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "changeSetId" TEXT,
    "priceBookId" TEXT,
    "ownerId" TEXT,
    "status" "PricingSheetStatus" NOT NULL DEFAULT 'DRAFT',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingLine" (
    "id" TEXT NOT NULL,
    "pricingSheetId" TEXT NOT NULL,
    "changeItemId" TEXT,
    "priceBookItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UNIT',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "source" "PricingLineSource" NOT NULL DEFAULT 'AUTOMATIC',
    "changeReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "apartmentId" TEXT,
    "userId" TEXT,
    "kind" "ActivityKind" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apartmentId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Building_projectId_name_key" ON "Building"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_buildingId_number_key" ON "Floor"("buildingId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ApartmentType_projectId_name_key" ON "ApartmentType"("projectId", "name");

-- CreateIndex
CREATE INDEX "Apartment_projectId_status_idx" ON "Apartment"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Apartment_projectId_buildingId_number_key" ON "Apartment"("projectId", "buildingId", "number");

-- CreateIndex
CREATE INDEX "Plan_apartmentId_kind_idx" ON "Plan"("apartmentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_planId_versionNo_key" ON "PlanVersion"("planId", "versionNo");

-- CreateIndex
CREATE INDEX "DrawingFile_planVersionId_idx" ON "DrawingFile"("planVersionId");

-- CreateIndex
CREATE INDEX "UploadedFile_organizationId_idx" ON "UploadedFile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeCategory_projectId_key_key" ON "ChangeCategory"("projectId", "key");

-- CreateIndex
CREATE INDEX "ChangeSet_apartmentId_idx" ON "ChangeSet"("apartmentId");

-- CreateIndex
CREATE INDEX "ChangeItem_changeSetId_status_idx" ON "ChangeItem"("changeSetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeItem_changeSetId_code_key" ON "ChangeItem"("changeSetId", "code");

-- CreateIndex
CREATE INDEX "AITrainingCorrection_projectId_idx" ON "AITrainingCorrection"("projectId");

-- CreateIndex
CREATE INDEX "Review_apartmentId_status_idx" ON "Review"("apartmentId", "status");

-- CreateIndex
CREATE INDEX "ReviewComment_reviewId_idx" ON "ReviewComment"("reviewId");

-- CreateIndex
CREATE INDEX "ConsultantRequest_status_idx" ON "ConsultantRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantRequest_apartmentId_code_key" ON "ConsultantRequest"("apartmentId", "code");

-- CreateIndex
CREATE INDEX "ConsultantResponse_requestId_idx" ON "ConsultantResponse"("requestId");

-- CreateIndex
CREATE INDEX "ProfessionalDecision_apartmentId_idx" ON "ProfessionalDecision"("apartmentId");

-- CreateIndex
CREATE INDEX "ProfessionalDecision_changeItemId_idx" ON "ProfessionalDecision"("changeItemId");

-- CreateIndex
CREATE INDEX "ProfessionalAssignment_assigneeId_status_idx" ON "ProfessionalAssignment"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Approval_apartmentId_kind_idx" ON "Approval"("apartmentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_organizationId_key_key" ON "Rule"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRule_projectId_key_key" ON "ProjectRule"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeItemRuleHit_changeItemId_ruleKey_key" ON "ChangeItemRuleHit"("changeItemId", "ruleKey");

-- CreateIndex
CREATE INDEX "PriceBook_organizationId_idx" ON "PriceBook"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookItem_priceBookId_code_key" ON "PriceBookItem"("priceBookId", "code");

-- CreateIndex
CREATE INDEX "PricingSheet_apartmentId_idx" ON "PricingSheet"("apartmentId");

-- CreateIndex
CREATE INDEX "PricingLine_pricingSheetId_idx" ON "PricingLine"("pricingSheetId");

-- CreateIndex
CREATE INDEX "ActivityLog_organizationId_createdAt_idx" ON "ActivityLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_apartmentId_createdAt_idx" ON "ActivityLog"("apartmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantChangeManagerId_fkey" FOREIGN KEY ("tenantChangeManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentType" ADD CONSTRAINT "ApartmentType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_apartmentTypeId_fkey" FOREIGN KEY ("apartmentTypeId") REFERENCES "ApartmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_assignedCoordinatorId_fkey" FOREIGN KEY ("assignedCoordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_apartmentTypeId_fkey" FOREIGN KEY ("apartmentTypeId") REFERENCES "ApartmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingFile" ADD CONSTRAINT "DrawingFile_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingFile" ADD CONSTRAINT "DrawingFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeCategory" ADD CONSTRAINT "ChangeCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "PlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_targetVersionId_fkey" FOREIGN KEY ("targetVersionId") REFERENCES "PlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeItem" ADD CONSTRAINT "ChangeItem_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeItem" ADD CONSTRAINT "ChangeItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ChangeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeItem" ADD CONSTRAINT "ChangeItem_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITrainingCorrection" ADD CONSTRAINT "AITrainingCorrection_changeItemId_fkey" FOREIGN KEY ("changeItemId") REFERENCES "ChangeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITrainingCorrection" ADD CONSTRAINT "AITrainingCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_changeItemId_fkey" FOREIGN KEY ("changeItemId") REFERENCES "ChangeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantRequest" ADD CONSTRAINT "ConsultantRequest_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantRequest" ADD CONSTRAINT "ConsultantRequest_changeItemId_fkey" FOREIGN KEY ("changeItemId") REFERENCES "ChangeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantRequest" ADD CONSTRAINT "ConsultantRequest_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantRequest" ADD CONSTRAINT "ConsultantRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantRequest" ADD CONSTRAINT "ConsultantRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantResponse" ADD CONSTRAINT "ConsultantResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ConsultantRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantResponse" ADD CONSTRAINT "ConsultantResponse_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalDecision" ADD CONSTRAINT "ProfessionalDecision_changeItemId_fkey" FOREIGN KEY ("changeItemId") REFERENCES "ChangeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalDecision" ADD CONSTRAINT "ProfessionalDecision_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalDecision" ADD CONSTRAINT "ProfessionalDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAssignment" ADD CONSTRAINT "ProfessionalAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAssignment" ADD CONSTRAINT "ProfessionalAssignment_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAssignment" ADD CONSTRAINT "ProfessionalAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAssignment" ADD CONSTRAINT "ProfessionalAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRule" ADD CONSTRAINT "ProjectRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRule" ADD CONSTRAINT "ProjectRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeItemRuleHit" ADD CONSTRAINT "ChangeItemRuleHit_changeItemId_fkey" FOREIGN KEY ("changeItemId") REFERENCES "ChangeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeItemRuleHit" ADD CONSTRAINT "ChangeItemRuleHit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeItemRuleHit" ADD CONSTRAINT "ChangeItemRuleHit_projectRuleId_fkey" FOREIGN KEY ("projectRuleId") REFERENCES "ProjectRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSheet" ADD CONSTRAINT "PricingSheet_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSheet" ADD CONSTRAINT "PricingSheet_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSheet" ADD CONSTRAINT "PricingSheet_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSheet" ADD CONSTRAINT "PricingSheet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingLine" ADD CONSTRAINT "PricingLine_pricingSheetId_fkey" FOREIGN KEY ("pricingSheetId") REFERENCES "PricingSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingLine" ADD CONSTRAINT "PricingLine_changeItemId_fkey" FOREIGN KEY ("changeItemId") REFERENCES "ChangeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingLine" ADD CONSTRAINT "PricingLine_priceBookItemId_fkey" FOREIGN KEY ("priceBookItemId") REFERENCES "PriceBookItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
