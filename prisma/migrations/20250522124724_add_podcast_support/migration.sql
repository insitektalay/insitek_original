-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('YOUTUBE', 'PODCAST');

-- AlterTable
ALTER TABLE "Insight" ADD COLUMN     "publishDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "source" "TranscriptSource" NOT NULL DEFAULT 'YOUTUBE',
ADD COLUMN     "sourceUrl" TEXT,
ALTER COLUMN "youtubeId" DROP NOT NULL;
