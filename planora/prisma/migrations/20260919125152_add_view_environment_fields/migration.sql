-- AlterTable
ALTER TABLE "ApartmentViewProfile" ADD COLUMN     "city" TEXT,
ADD COLUMN     "environmentPreset" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultViewType" "ViewType",
ADD COLUMN     "environmentPreset" TEXT;
