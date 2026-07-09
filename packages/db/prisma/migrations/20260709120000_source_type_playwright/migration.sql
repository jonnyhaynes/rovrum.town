-- AlterEnum
-- Add PLAYWRIGHT for sources that need a headless browser (Millers, iTrent).
-- Postgres 12+ allows ADD VALUE inside a transaction provided the new value is
-- not *used* in the same transaction — this migration only adds it (usage lands
-- later via the seed), so Prisma's transactional apply is safe.
ALTER TYPE "SourceType" ADD VALUE 'PLAYWRIGHT';
