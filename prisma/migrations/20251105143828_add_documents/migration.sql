-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "wordCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DocumentToTranscript" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DocumentToTranscript_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_DocumentToTranscript_B_index" ON "_DocumentToTranscript"("B");

-- AddForeignKey
ALTER TABLE "_DocumentToTranscript" ADD CONSTRAINT "_DocumentToTranscript_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentToTranscript" ADD CONSTRAINT "_DocumentToTranscript_B_fkey" FOREIGN KEY ("B") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
