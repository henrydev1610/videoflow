#!/bin/sh
set -eu
mkdir -p docs/verification/docker
step() {
  name="$1"; shift
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "docs/verification/docker/$name.log"
  printf 'Command:' >> "docs/verification/docker/$name.log"
  printf ' %s' "$@" >> "docs/verification/docker/$name.log"
  printf '\n' >> "docs/verification/docker/$name.log"
  code=0
  "$@" >> "docs/verification/docker/$name.log" 2>&1 || code=$?
  printf '\nExit code: %s\n' "$code" >> "docs/verification/docker/$name.log"
  cat "docs/verification/docker/$name.log"
  return "$code"
}
step install npm ci --ignore-scripts
step generate npm run db:generate
step lint npm run lint
step format npm run format:check
step typecheck npm run typecheck
step build npm run build
step audit npm audit --audit-level=moderate
step setup node infra/scripts/quality-setup.mjs
MAIN_DATABASE_URL="$DATABASE_URL"
export DATABASE_URL="${DATABASE_URL%/*}/videoflow_regression"
export REDIS_URL=redis://videoflow-redis:6379/1
export RUN_INTEGRATION=1
step regression-migrate npm run db:migrate
step regression npm test -- --configLoader runner --testTimeout 15000 --exclude tests/media.integration.test.ts --exclude tests/media-api.integration.test.ts --exclude tests/media-lifecycle.integration.test.ts
export DATABASE_URL="$MAIN_DATABASE_URL"
export REDIS_URL=redis://videoflow-redis:6379
export RUN_MEDIA=1
step media npm test -- --configLoader runner tests/media.integration.test.ts tests/media-api.integration.test.ts tests/media-lifecycle.integration.test.ts
