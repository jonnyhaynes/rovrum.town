# Local infrastructure

Local dev services for Rovrum, as plain Docker containers (portable — any host is a
deploy _target_, never a dependency).

- **Postgres 16** — primary database and the pg-boss job queue.
- **MinIO** — S3-compatible object storage, standing in for Cloudflare R2 locally.
- **workers** — the ingestion worker (`apps/workers`), built from `Dockerfile.workers`.
  Runs `prisma migrate deploy` on boot, then the pg-boss scheduler + ingest workers.

## Bring it up

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps   # wait for "healthy"
```

Data persists under `docker-data/` at the repo root (gitignored). Tear down with
`docker compose -f infra/docker-compose.yml down` (add `-v`… actually there's no named
volume — just delete `docker-data/` to wipe state).

## Connect

Copy the root `.env.example` to `.env`; the defaults already match this compose file:

- `DATABASE_URL=postgresql://rovrum:rovrum@localhost:5432/rovrum?schema=public`
- `S3_ENDPOINT=http://localhost:9000` · `S3_BUCKET=rovrum` · keys `rovrum-local`/`change-me-local-only`

MinIO console: <http://localhost:9001> (login with the S3 keys).

Then from the repo root:

```bash
pnpm db:generate     # generate the Prisma client
pnpm db:migrate      # apply migrations (first run creates the schema)
pnpm db:studio       # browse data in Prisma Studio
```

## Run the ingestion pipeline

Two ways:

**In containers (portability check — the whole pipeline in Docker):**

```bash
docker compose -f infra/docker-compose.yml up -d postgres workers
pnpm --filter @rovrum/workers seed   # one-time: populate the source registry
docker compose -f infra/docker-compose.yml logs -f workers
```

The `workers` container applies migrations on boot, then the dispatcher enqueues
due sources and ingest workers fill `content_items`. Watch it in Prisma Studio.

**On the host (for development / faster iteration):**

```bash
docker compose -f infra/docker-compose.yml up -d postgres
pnpm db:migrate && pnpm --filter @rovrum/workers seed
pnpm --filter @rovrum/workers dev    # tsx watch; Ctrl-C to stop
```
