/*
  Warnings:

  - You are about to drop the column `topicName` on the `Insight` table. All the data in the column will be lost.
  - Added the required column `insightName` to the `Insight` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Insight" DROP COLUMN "topicName",
ADD COLUMN     "insightName" TEXT NOT NULL;
