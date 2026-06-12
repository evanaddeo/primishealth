#!/usr/bin/env bash
# scripts/db-reset.sh — *** DESTRUCTIVE *** Reset the local development database.
#
# ==============================================================================
# WARNING: DESTRUCTIVE OPERATION
# This script PERMANENTLY DELETES all local development data by removing the
# Docker volume and recreating the database from scratch.
# DO NOT run this against a database you want to keep.
# This script only affects local Docker volumes — never production or staging.
# ==============================================================================
#
# What this script does:
#   1. Stops the db container.
#   2. Removes the primis_db_data Docker volume (ALL DATA LOST).
#   3. Restarts the db container with a fresh empty database.
#   4. Waits until Postgres is ready.
#   5. Prints a reminder to run migrations (pnpm db:migrate — available after CU-026).
#
# Usage:
#   bash scripts/db-reset.sh
#   # or, after chmod +x:
#   ./scripts/db-reset.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo ""
echo "============================================================"
echo "  *** DESTRUCTIVE OPERATION: LOCAL DATABASE RESET ***"
echo "  All data in primis_db_data volume will be permanently"
echo "  deleted. This only affects local Docker volumes."
echo "============================================================"
echo ""

# Allow non-interactive runs by checking for a --yes flag.
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Are you sure you want to reset the local database? [y/N] " confirm
  case "${confirm}" in
    [yY][eE][sS]|[yY]) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

echo "Stopping db container..."
docker compose stop db

echo "Removing primis_db_data volume..."
docker compose down -v --remove-orphans 2>/dev/null || true
docker volume rm primis_db_data 2>/dev/null || true

echo "Starting fresh db container..."
docker compose up -d db

echo "Waiting for Postgres to be ready..."
docker compose exec db pg_isready -U primis -d primis_dev

echo ""
echo "Database reset complete. A fresh empty database is running."
echo ""
echo "Next step: run migrations to restore the schema:"
echo "  pnpm db:migrate   (available after CU-026)"
echo ""
