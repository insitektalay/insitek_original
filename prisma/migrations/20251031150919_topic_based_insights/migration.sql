/*
  Warnings:

  - You are about to drop the column `channel` on the `Insight` table. All the data in the column will be lost.
  - You are about to drop the column `folder` on the `Insight` table. All the data in the column will be lost.
  - You are about to drop the column `publishDate` on the `Insight` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Insight` table. All the data in the column will be lost.
  - Added the required column `topicName` to the `Insight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Insight` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Insight" DROP COLUMN "channel",
DROP COLUMN "folder",
DROP COLUMN "publishDate",
DROP COLUMN "title",
ADD COLUMN     "topicName" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "segments" JSONB;

-- CreateTable
CREATE TABLE "InsightSource" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "contentSnippet" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "InsightSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightSource_insightId_idx" ON "InsightSource"("insightId");

-- CreateIndex
CREATE INDEX "InsightSource_transcriptId_idx" ON "InsightSource"("transcriptId");

-- CreateIndex
CREATE UNIQUE INDEX "InsightSource_insightId_transcriptId_orderIndex_key" ON "InsightSource"("insightId", "transcriptId", "orderIndex");

-- AddForeignKey
ALTER TABLE "InsightSource" ADD CONSTRAINT "InsightSource_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightSource" ADD CONSTRAINT "InsightSource_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
