#!/usr/bin/env bash
# Firefly experimental Vercel Sandbox boot entrypoint.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ "$(git branch --show-current)" != "ai/preview-test" ]]; then
  echo "Refusing to run: sandbox must be on ai/preview-test." >&2
  exit 3
fi
case "${PUBLIC_FIREFLY_SANDBOX_HOST:-}" in
  sb-*.vercel.run) ;;
  *) echo "Set PUBLIC_FIREFLY_SANDBOX_HOST to the exact Sandbox preview host." >&2; exit 3 ;;
esac
if [[ "${PUBLIC_GALLERY_API_ORIGIN:-}" != "https://firefly-gallery-api-preview.guojunyang666666.workers.dev" ]]; then
  echo "Refusing a non-preview gallery API in Sandbox development." >&2
  exit 3
fi

export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$PUBLIC_FIREFLY_SANDBOX_HOST"
export PUBLIC_GITHUB_ADMIN_BRANCH="ai/preview-test"
export PUBLIC_FIREFLY_PREVIEW_DEMO="true"

if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:4321/"; then
  echo "Firefly Astro dev server already running on port 4321."
  exit 0
fi
if [[ ! -x "node_modules/.bin/astro" ]]; then
  echo "Missing dependencies; restoring from the lockfile."
  pnpm install --frozen-lockfile
fi
echo "Starting Astro/Vite HMR on 0.0.0.0:4321..."
exec pnpm dev --host 0.0.0.0 --port 4321
