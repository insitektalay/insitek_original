/*
  Warnings:

  - Made the column `publishDate` on table `Transcript` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Insight" ALTER COLUMN "channel" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "publishDate" SET NOT NULL;
