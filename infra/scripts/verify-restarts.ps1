$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
$compose=@('compose','-f','compose.yaml','-f','compose.test.yaml')
function Invoke-Checked([string[]]$Command) {
  & docker @compose @Command
  if($LASTEXITCODE -ne 0) { throw "Compose failed: $($Command -join ' ')" }
}
$seed=Invoke-Checked @('run','--rm','--no-deps','quality','node','--import','tsx','tests/fixtures/recovery.ts','seed')
$ready=$seed | Where-Object { $_ -match 'readyForKill' } | ConvertFrom-Json
if(!$ready.readyForKill) { throw 'Worker did not start fixture' }
Invoke-Checked @('kill','-s','SIGKILL','videoflow-worker')
Invoke-Checked @('start','videoflow-worker')
Invoke-Checked @('run','--rm','--no-deps','quality','node','--import','tsx','tests/fixtures/recovery.ts',$ready.jobId) | Set-Content docs/verification/docker/worker-recovery.log
$log=Join-Path $PWD 'docs/verification/docker/api-restart.log'
$errorLog=Join-Path $PWD 'docs/verification/docker/api-restart-stderr.log'
$probe=Start-Process docker -ArgumentList ($compose+@('run','--rm','--no-deps','quality','node','--import','tsx','tests/fixtures/api-restart.ts')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError $errorLog
try {
  $deadline=(Get-Date).AddSeconds(60)
  while((Get-Date) -lt $deadline -and !(Select-String -Path $log -Pattern 'readyForRestart' -Quiet)) {
    if($probe.HasExited) { throw 'API restart probe exited before ready' }
    Start-Sleep -Milliseconds 500
  }
  if(!(Select-String -Path $log -Pattern 'readyForRestart' -Quiet)) { throw 'API restart probe timed out' }
  Invoke-Checked @('stop','videoflow-api')
  Start-Sleep -Seconds 2
  Invoke-Checked @('start','videoflow-api')
  if(!$probe.WaitForExit(150000)) { throw 'API restart probe did not finish' }
  if($probe.ExitCode -ne 0) { throw 'API restart persistence failed' }
} finally {
  Invoke-Checked @('start','videoflow-api')
}
Invoke-Checked @('exec','-T','videoflow-redis','redis-cli','SET','videoflow:acceptance:persistence',$ready.jobId) | Out-Null
Invoke-Checked @('stop','videoflow-redis')
Invoke-Checked @('start','videoflow-redis')
Invoke-Checked @('up','-d','--wait','--no-build') | Out-Null
$stored=Invoke-Checked @('exec','-T','videoflow-redis','redis-cli','GET','videoflow:acceptance:persistence')
if($stored -ne $ready.jobId) { throw 'Redis persistence failed' }
@{Date=(Get-Date).ToUniversalTime().ToString('o');RedisPersisted=$true;WorkerRecovered=$ready.jobId;ApiPersisted=$true;ExitCode=0} | ConvertTo-Json | Set-Content docs/verification/docker/restarts.json
