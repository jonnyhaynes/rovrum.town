#!/bin/sh
# Apply pending DB migrations, then start the worker. migrate deploy is safe to
# run on every boot — it only applies migrations not yet recorded, and is a no-op
# once the schema is current.
set -e

echo "[entrypoint] applying migrations…"
node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

echo "[entrypoint] starting worker…"
exec "$@"
