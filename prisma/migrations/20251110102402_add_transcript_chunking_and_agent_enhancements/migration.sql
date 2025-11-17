-- CreateEnum
CREATE TYPE "NoteImportance" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "AgentDocument" ADD COLUMN     "notesUtilization" DOUBLE PRECISION,
ADD COLUMN     "transcriptsRead" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transcriptsSearched" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "workflowPlan" JSONB;

-- AlterTable
ALTER TABLE "AgentNote" ADD COLUMN     "importance" "NoteImportance" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "AgentSection" ADD COLUMN     "notesUsedIds" TEXT[],
ADD COLUMN     "revisedAt" TIMESTAMP(3),
ADD COLUMN     "writtenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TranscriptChunk" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "summary" TEXT,
    "keywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptMetadata" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "avgChunkSize" INTEGER NOT NULL,
    "topics" TEXT[],
    "speakers" TEXT[],
    "hasSummary" BOOLEAN NOT NULL DEFAULT false,
    "lastChunkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptChunk_transcriptId_idx" ON "TranscriptChunk"("transcriptId");

-- CreateIndex
CREATE INDEX "TranscriptChunk_keywords_idx" ON "TranscriptChunk"("keywords");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptChunk_transcriptId_chunkIndex_key" ON "TranscriptChunk"("transcriptId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptMetadata_transcriptId_key" ON "TranscriptMetadata"("transcriptId");

-- CreateIndex
CREATE INDEX "TranscriptMetadata_transcriptId_idx" ON "TranscriptMetadata"("transcriptId");

-- CreateIndex
CREATE INDEX "AgentDocument_variantId_idx" ON "AgentDocument"("variantId");

-- CreateIndex
CREATE INDEX "AgentNote_importance_idx" ON "AgentNote"("importance");

-- AddForeignKey
ALTER TABLE "TranscriptChunk" ADD CONSTRAINT "TranscriptChunk_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptMetadata" ADD CONSTRAINT "TranscriptMetadata_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
