$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
$argsCompose=@('compose','-f','compose.yaml','-f','compose.migration-test.yaml')
try {
  & docker @argsCompose up -d videoflow-api videoflow-worker | Set-Content docs/verification/docker/migration-failure-up.log
  $failureCode=$LASTEXITCODE
  if($failureCode -eq 0) { throw 'Invalid migration unexpectedly succeeded' }
  & docker @argsCompose logs videoflow-migrate | Set-Content docs/verification/docker/migration-failure.log
  $migrationId=& docker @argsCompose ps -a -q videoflow-migrate
  $migration=(& docker inspect $migrationId | ConvertFrom-Json)[0]
  if($migration.State.ExitCode -eq 0) { throw 'Migration exit code should be non-zero' }
  foreach($service in @('videoflow-api','videoflow-worker')) {
    $id=& docker @argsCompose ps -a -q $service
    if($id) {
      $container=(& docker inspect $id | ConvertFrom-Json)[0]
      if($container.State.Running) { throw "Dependent unexpectedly running: $service" }
    }
  }
  & docker @argsCompose exec -T videoflow-postgres psql -U videoflow -d videoflow -Atc 'SELECT count(*) FROM "_prisma_migrations";' | Set-Content docs/verification/docker/migration-preserved.txt
  if($LASTEXITCODE -ne 0) { throw 'Database was not preserved' }
  @{Date=(Get-Date).ToUniversalTime().ToString('o');ExpectedFailureExit=$failureCode;MigrationExit=$migration.State.ExitCode;DependentsBlocked=$true;VolumesPreserved=$true} | ConvertTo-Json | Set-Content docs/verification/docker/migration-result.json
} finally { & docker @argsCompose stop }
