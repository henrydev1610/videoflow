param([ValidateSet('up','stop','status','logs','quality','e2e','cleanup','backup')][string]$Action='status')
$ErrorActionPreference='Stop'
Push-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
try {
  switch ($Action) {
    'up' { docker compose up -d --build }
    'stop' { docker compose stop }
    'status' { docker compose ps -a }
    'logs' { docker compose logs --tail 100 }
    'quality' { docker compose -f compose.yaml -f compose.test.yaml run --rm quality }
    'e2e' { docker compose -f compose.yaml -f compose.test.yaml run --rm e2e }
    'cleanup' { docker compose exec -T videoflow-worker node workers/media-worker/dist/cleanup-main.js }
    'backup' {
      $backupName = 'videoflow-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.dump'
      New-Item -ItemType Directory -Force backups | Out-Null
      docker compose exec -T videoflow-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/tmp/$1"' sh $backupName
      if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou' }
      $encoded = docker compose exec -T videoflow-postgres base64 "/tmp/$backupName"
      if ($LASTEXITCODE -ne 0) { throw 'Leitura do backup falhou' }
      [IO.File]::WriteAllBytes((Join-Path $PWD "backups/$backupName"), [Convert]::FromBase64String(($encoded -join '')))
      Write-Output "Backup: backups/$backupName (banco; artefatos exigem cópia coordenada)"
    }
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
