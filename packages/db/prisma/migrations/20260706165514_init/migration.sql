-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('NEWS', 'SPORTS', 'EVENTS', 'JOBS');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'HTML', 'API');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "IngestRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "config" JSONB,
    "fetchCadence" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "location" TEXT,
    "raw" JSONB NOT NULL,
    "eventDetails" JSONB,
    "jobDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "variants" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" "IngestRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "stats" JSONB,

    CONSTRAINT "ingest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_items_contentHash_key" ON "content_items"("contentHash");

-- CreateIndex
CREATE INDEX "content_items_vertical_idx" ON "content_items"("vertical");

-- CreateIndex
CREATE INDEX "content_items_publishedAt_idx" ON "content_items"("publishedAt");

-- CreateIndex
CREATE INDEX "content_items_sourceId_idx" ON "content_items"("sourceId");

-- CreateIndex
CREATE INDEX "social_posts_status_idx" ON "social_posts"("status");

-- CreateIndex
CREATE INDEX "social_posts_scheduledFor_idx" ON "social_posts"("scheduledFor");

-- CreateIndex
CREATE INDEX "ingest_runs_sourceId_idx" ON "ingest_runs"("sourceId");

-- CreateIndex
CREATE INDEX "ingest_runs_startedAt_idx" ON "ingest_runs"("startedAt");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
