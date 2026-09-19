-- CreateEnum
CREATE TYPE "MaterialFamily" AS ENUM ('WOOD', 'MARBLE', 'STONE', 'CONCRETE', 'GLASS', 'METAL', 'FABRIC', 'PAINT', 'CERAMIC', 'OUTDOOR');

-- AlterTable
ALTER TABLE "CatalogProduct" ADD COLUMN     "materialPresetId" TEXT;

-- AlterTable
ALTER TABLE "MaterialDefinition" ADD COLUMN     "family" "MaterialFamily" NOT NULL DEFAULT 'PAINT';

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "materialConfig" JSONB,
ADD COLUMN     "modelUrl" TEXT,
ADD COLUMN     "textureUrl" TEXT;
