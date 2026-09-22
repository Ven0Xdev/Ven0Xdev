-- CreateEnum
CREATE TYPE "AccountCreationMethod" AS ENUM ('BOOTSTRAP', 'PLATFORM_ADMIN');

-- CreateTable
CREATE TABLE "AdminBootstrap" (
    "id" TEXT NOT NULL,
    "lock" TEXT NOT NULL DEFAULT 'singleton',
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "method" "AccountCreationMethod" NOT NULL DEFAULT 'BOOTSTRAP',
    "secretFingerprint" TEXT NOT NULL,
    "performedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBootstrap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminBootstrap_lock_key" ON "AdminBootstrap"("lock");

-- CreateIndex
CREATE UNIQUE INDEX "AdminBootstrap_userId_key" ON "AdminBootstrap"("userId");

