-- AlterTable
-- `sources` is empty at this point (registry not yet seeded), so a required
-- column with no default needs no backfill.
ALTER TABLE "sources" ADD COLUMN "vertical" "Vertical" NOT NULL;
