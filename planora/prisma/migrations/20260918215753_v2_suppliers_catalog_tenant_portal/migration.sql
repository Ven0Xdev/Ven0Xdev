-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('KITCHEN', 'FLOORING', 'SANITARY', 'DOORS', 'LIGHTING', 'HVAC', 'WINDOWS', 'OUTDOOR', 'FURNITURE', 'APPLIANCES', 'OTHER');

-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('DRAFT', 'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PRICED', 'PAID');

-- CreateEnum
CREATE TYPE "ConfigurationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REQUIRES_CONSULTANT', 'PRICED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExceptionRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SENT_TO_SUPPLIER', 'MORE_INFO_REQUIRED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('FLOOR', 'WALL', 'COUNTERTOP', 'CABINET_FRONT', 'DOOR', 'FIXTURE', 'OUTDOOR', 'OTHER');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('SEA', 'CITY', 'PARK', 'STREET', 'MOUNTAIN', 'OTHER');

-- AlterTable
ALTER TABLE "Apartment" ADD COLUMN     "tenantUserId" TEXT;

-- AlterTable
ALTER TABLE "ChangeItem" ADD COLUMN     "commissionEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMajorChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "majorChangeReason" TEXT,
ADD COLUMN     "majorChangeValue" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupplierCategory" NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSupplier" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "defaultForCategory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Catalog" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "catalogId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "SupplierCategory" NOT NULL,
    "sku" TEXT NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "modelUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "optionType" TEXT NOT NULL DEFAULT 'OTHER',
    "sku" TEXT,
    "priceDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "metadata" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "optionType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectProductAvailability" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "includedInStandard" BOOLEAN NOT NULL DEFAULT false,
    "upgradePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresConsultant" BOOLEAN NOT NULL DEFAULT false,
    "minimumRooms" DOUBLE PRECISION,
    "maximumQuantity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectProductAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentStandardPackage" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "category" "SupplierCategory" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApartmentStandardPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpgradePackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpgradePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpgradePackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "UpgradePackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentConfiguration" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApartmentConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentSelection" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "category" "SupplierCategory" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SelectionStatus" NOT NULL DEFAULT 'DRAFT',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresConsultant" BOOLEAN NOT NULL DEFAULT false,
    "isMajorChange" BOOLEAN NOT NULL DEFAULT false,
    "selectedById" TEXT,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApartmentSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "category" "ChangeCategoryKey" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "routedToRole" "UserRole",
    "consultantKind" "ConsultantKind",
    "estimatedPrice" DOUBLE PRECISION,
    "attachments" JSONB,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionRequest" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "category" "SupplierCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceUrl" TEXT,
    "supplierId" TEXT,
    "status" "ExceptionRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decisionNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#cccccc',
    "textureUrl" TEXT,
    "roughness" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "metalness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productId" TEXT,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecommendation" (
    "id" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "targetProductId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCommercialTerms" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "setupFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perApartmentFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "majorChangesCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "majorChangeThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCommercialTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentViewProfile" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "floorHeightM" DOUBLE PRECISION,
    "orientation" DOUBLE PRECISION,
    "viewType" "ViewType" NOT NULL DEFAULT 'OTHER',
    "balconyDirection" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApartmentViewProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_category_idx" ON "Supplier"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organizationId_name_key" ON "Supplier"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSupplier_projectId_supplierId_key" ON "ProjectSupplier"("projectId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Catalog_supplierId_name_key" ON "Catalog"("supplierId", "name");

-- CreateIndex
CREATE INDEX "CatalogProduct_category_active_idx" ON "CatalogProduct"("category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_supplierId_sku_key" ON "CatalogProduct"("supplierId", "sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_optionType_idx" ON "ProductVariant"("productId", "optionType");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_optionType_key" ON "ProductOption"("productId", "optionType");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductFile_productId_idx" ON "ProductFile"("productId");

-- CreateIndex
CREATE INDEX "ProjectProductAvailability_projectId_available_idx" ON "ProjectProductAvailability"("projectId", "available");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductAvailability_projectId_productId_key" ON "ProjectProductAvailability"("projectId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ApartmentStandardPackage_apartmentId_category_productId_key" ON "ApartmentStandardPackage"("apartmentId", "category", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "UpgradePackage_projectId_name_key" ON "UpgradePackage"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UpgradePackageItem_packageId_productId_key" ON "UpgradePackageItem"("packageId", "productId");

-- CreateIndex
CREATE INDEX "ApartmentConfiguration_apartmentId_status_idx" ON "ApartmentConfiguration"("apartmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApartmentConfiguration_apartmentId_versionNo_key" ON "ApartmentConfiguration"("apartmentId", "versionNo");

-- CreateIndex
CREATE INDEX "ApartmentSelection_apartmentId_status_idx" ON "ApartmentSelection"("apartmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApartmentSelection_configurationId_category_productId_key" ON "ApartmentSelection"("configurationId", "category", "productId");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_apartmentId_code_key" ON "ChangeRequest"("apartmentId", "code");

-- CreateIndex
CREATE INDEX "ExceptionRequest_status_idx" ON "ExceptionRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExceptionRequest_apartmentId_code_key" ON "ExceptionRequest"("apartmentId", "code");

-- CreateIndex
CREATE INDEX "MaterialDefinition_category_idx" ON "MaterialDefinition"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecommendation_sourceProductId_targetProductId_key" ON "ProductRecommendation"("sourceProductId", "targetProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCommercialTerms_projectId_key" ON "ProjectCommercialTerms"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ApartmentViewProfile_apartmentId_key" ON "ApartmentViewProfile"("apartmentId");

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSupplier" ADD CONSTRAINT "ProjectSupplier_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSupplier" ADD CONSTRAINT "ProjectSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Catalog" ADD CONSTRAINT "Catalog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFile" ADD CONSTRAINT "ProductFile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductAvailability" ADD CONSTRAINT "ProjectProductAvailability_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductAvailability" ADD CONSTRAINT "ProjectProductAvailability_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentStandardPackage" ADD CONSTRAINT "ApartmentStandardPackage_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentStandardPackage" ADD CONSTRAINT "ApartmentStandardPackage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentStandardPackage" ADD CONSTRAINT "ApartmentStandardPackage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpgradePackage" ADD CONSTRAINT "UpgradePackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpgradePackageItem" ADD CONSTRAINT "UpgradePackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "UpgradePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpgradePackageItem" ADD CONSTRAINT "UpgradePackageItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentConfiguration" ADD CONSTRAINT "ApartmentConfiguration_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentConfiguration" ADD CONSTRAINT "ApartmentConfiguration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentSelection" ADD CONSTRAINT "ApartmentSelection_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentSelection" ADD CONSTRAINT "ApartmentSelection_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "ApartmentConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentSelection" ADD CONSTRAINT "ApartmentSelection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentSelection" ADD CONSTRAINT "ApartmentSelection_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentSelection" ADD CONSTRAINT "ApartmentSelection_selectedById_fkey" FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRequest" ADD CONSTRAINT "ExceptionRequest_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRequest" ADD CONSTRAINT "ExceptionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRequest" ADD CONSTRAINT "ExceptionRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDefinition" ADD CONSTRAINT "MaterialDefinition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDefinition" ADD CONSTRAINT "MaterialDefinition_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommercialTerms" ADD CONSTRAINT "ProjectCommercialTerms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentViewProfile" ADD CONSTRAINT "ApartmentViewProfile_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
