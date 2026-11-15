$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
$compose=@('compose','-f','compose.yaml','-f','compose.test.yaml')
$results=@()
foreach($dependency in @('videoflow-redis','videoflow-postgres')) {
  try {
    & docker @compose stop $dependency
    if($LASTEXITCODE -ne 0) { throw 'Dependency stop failed' }
    & docker @compose exec -T videoflow-api node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{console.log(r.status);process.exit(r.status===503?0:1)})"
    if($LASTEXITCODE -ne 0) { throw 'API did not report unavailable' }
    & docker @compose exec -T videoflow-worker node infra/health/check.mjs worker
    if($LASTEXITCODE -eq 0) { throw 'Worker did not report unavailable' }
    $deadline=(Get-Date).AddSeconds(75)
    do {
      $apiId=& docker @compose ps -q videoflow-api
      $workerId=& docker @compose ps -q videoflow-worker
      $apiHealth=& docker inspect $apiId --format '{{.State.Health.Status}}'
      $workerHealth=& docker inspect $workerId --format '{{.State.Health.Status}}'
      if($apiHealth -eq 'unhealthy' -and $workerHealth -eq 'unhealthy') { break }
      Start-Sleep -Seconds 2
    } while((Get-Date) -lt $deadline)
    if($apiHealth -ne 'unhealthy' -or $workerHealth -ne 'unhealthy') { throw 'Docker did not observe degraded health' }
    $results+=@{Dependency=$dependency;ApiStatus=503;WorkerUnavailable=$true;DockerApi=$apiHealth;DockerWorker=$workerHealth}
  } finally {
    & docker @compose start $dependency
    if($LASTEXITCODE -ne 0) { throw 'Dependency restore failed' }
  }
  & docker @compose up -d --wait --no-build
  if($LASTEXITCODE -ne 0) { throw 'Health did not recover' }
}
@{Date=(Get-Date).ToUniversalTime().ToString('o');Checks=$results;ExitCode=0} | ConvertTo-Json -Depth 4 | Set-Content docs/verification/docker/health-failure.json
