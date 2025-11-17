-- CreateTable
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueVideo" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" TEXT,
    "viewCount" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "url" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcriptId" TEXT,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "QueueVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueueVideo_queueId_idx" ON "QueueVideo"("queueId");

-- CreateIndex
CREATE INDEX "QueueVideo_youtubeId_idx" ON "QueueVideo"("youtubeId");

-- AddForeignKey
ALTER TABLE "QueueVideo" ADD CONSTRAINT "QueueVideo_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueVideo" ADD CONSTRAINT "QueueVideo_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
