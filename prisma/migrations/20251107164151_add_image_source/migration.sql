-- AlterEnum
ALTER TYPE "TranscriptSource" ADD VALUE 'IMAGE';

-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "imageFilename" TEXT;
