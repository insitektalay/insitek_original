-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('INITIALIZING', 'READING', 'PLANNING', 'WRITING', 'POLISHING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "AgentDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'INITIALIZING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "content" TEXT,
    "wordCount" INTEGER,
    "conversationId" TEXT,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "generationTime" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "content" TEXT,
    "wordCount" INTEGER,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentNote" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "noteType" TEXT,
    "sourceTranscriptId" TEXT NOT NULL,
    "usedInFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolCall" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "toolOutput" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AgentDocumentToTranscript" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AgentDocumentToTranscript_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AgentDocument_status_idx" ON "AgentDocument"("status");

-- CreateIndex
CREATE INDEX "AgentSection_documentId_idx" ON "AgentSection"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSection_documentId_order_key" ON "AgentSection"("documentId", "order");

-- CreateIndex
CREATE INDEX "AgentNote_documentId_sectionTitle_idx" ON "AgentNote"("documentId", "sectionTitle");

-- CreateIndex
CREATE INDEX "AgentNote_documentId_idx" ON "AgentNote"("documentId");

-- CreateIndex
CREATE INDEX "AgentToolCall_documentId_idx" ON "AgentToolCall"("documentId");

-- CreateIndex
CREATE INDEX "AgentToolCall_toolName_idx" ON "AgentToolCall"("toolName");

-- CreateIndex
CREATE INDEX "_AgentDocumentToTranscript_B_index" ON "_AgentDocumentToTranscript"("B");

-- AddForeignKey
ALTER TABLE "AgentSection" ADD CONSTRAINT "AgentSection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AgentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentNote" ADD CONSTRAINT "AgentNote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AgentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentNote" ADD CONSTRAINT "AgentNote_sourceTranscriptId_fkey" FOREIGN KEY ("sourceTranscriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AgentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentDocumentToTranscript" ADD CONSTRAINT "_AgentDocumentToTranscript_A_fkey" FOREIGN KEY ("A") REFERENCES "AgentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentDocumentToTranscript" ADD CONSTRAINT "_AgentDocumentToTranscript_B_fkey" FOREIGN KEY ("B") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
