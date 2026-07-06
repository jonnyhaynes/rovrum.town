# Local infrastructure

Local dev services for Rovrum, as plain Docker containers (portable — any host is a
deploy _target_, never a dependency).

- **Postgres 16** — primary database and the pg-boss job queue (later phases).
- **MinIO** — S3-compatible object storage, standing in for Cloudflare R2 locally.

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
- `S3_ENDPOINT=http://localhost:9000` · `S3_BUCKET=rovrum` · keys `minioadmin`/`minioadmin`

MinIO console: <http://localhost:9001> (login with the S3 keys).

Then from the repo root:

```bash
pnpm db:generate     # generate the Prisma client
pnpm db:migrate      # apply migrations (first run creates the schema)
pnpm db:studio       # browse data in Prisma Studio
```
