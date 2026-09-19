-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PARTIALLY_PAID', 'PAID');

-- AlterTable
ALTER TABLE "Apartment" ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "portalWelcomeText" TEXT,
ADD COLUMN     "supportEmail" TEXT,
ADD COLUMN     "supportHours" TEXT,
ADD COLUMN     "supportPhone" TEXT,
ADD COLUMN     "tenantChangesCloseDate" TIMESTAMP(3),
ADD COLUMN     "tenantChangesOpenDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;
