-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "clusterId" TEXT;

-- CreateTable
CREATE TABLE "story_clusters" (
    "id" TEXT NOT NULL,
    "canonicalItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "story_clusters_canonicalItemId_key" ON "story_clusters"("canonicalItemId");

-- CreateIndex
CREATE INDEX "content_items_clusterId_idx" ON "content_items"("clusterId");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "story_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
