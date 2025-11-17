-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ANALYZING', 'AWAITING_QUESTIONS', 'AWAITING_PREVIEW', 'AWAITING_APPROVAL', 'GENERATING_OUTLINE', 'EXTRACTING', 'SYNTHESIZING', 'POLISHING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "currentStage" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "outline" JSONB,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'ANALYZING',
ALTER COLUMN "content" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DocumentSection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "keyTopics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "sectionRef" TEXT NOT NULL,
    "extractType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT,
    "suggestedTypes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSection_documentId_idx" ON "DocumentSection"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSection_documentId_sectionNumber_key" ON "DocumentSection"("documentId", "sectionNumber");

-- CreateIndex
CREATE INDEX "DocumentExtraction_documentId_sectionRef_idx" ON "DocumentExtraction"("documentId", "sectionRef");

-- CreateIndex
CREATE INDEX "DocumentExtraction_transcriptId_idx" ON "DocumentExtraction"("transcriptId");

-- CreateIndex
CREATE INDEX "DocumentExtraction_documentId_idx" ON "DocumentExtraction"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentSection" ADD CONSTRAINT "DocumentSection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
