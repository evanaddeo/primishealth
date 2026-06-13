#!/usr/bin/env bash
# scripts/db-up.sh — Start the local Postgres development database.
#
# Starts the db service in the background and waits until Postgres is ready
# to accept connections.
#
# Usage:
#   bash scripts/db-up.sh
#   # or, after chmod +x:
#   ./scripts/db-up.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "Starting Primis local Postgres..."
docker compose up -d db

echo "Waiting for Postgres to be ready..."
docker compose exec db pg_isready -U primis -d primis_dev

echo "Postgres is ready. DATABASE_URL: postgres://primis:primis@localhost:${POSTGRES_PORT:-5432}/primis_dev"
