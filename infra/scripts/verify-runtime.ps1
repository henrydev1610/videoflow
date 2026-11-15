# Executes only against the isolated acceptance project; never removes volumes.
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
$composeArgs=@('compose','-f','compose.yaml','-f','compose.test.yaml')
New-Item -ItemType Directory -Force docs/verification/docker | Out-Null
function Invoke-TestCompose([string[]]$Command) {
  & docker @composeArgs @Command
  if ($LASTEXITCODE -ne 0) { throw "Compose failed: $($Command -join ' ')" }
}
$ids=Invoke-TestCompose @('ps','-q')
$inspections=@()
foreach($id in $ids) {
  $item=(& docker inspect $id | ConvertFrom-Json)[0]
  if($item.HostConfig.Privileged) { throw 'Privileged container' }
  if($item.Mounts.Source -match 'docker.sock') { throw 'Docker socket mount' }
  $inspections+= [ordered]@{Name=$item.Name;Image=$item.Image;User=$item.Config.User;State=$item.State.Status;Health=$item.State.Health.Status;ReadOnly=$item.HostConfig.ReadonlyRootfs;Memory=$item.HostConfig.Memory;NanoCpus=$item.HostConfig.NanoCpus;Pids=$item.HostConfig.PidsLimit;Capabilities=$item.HostConfig.CapDrop;Ports=$item.HostConfig.PortBindings;Networks=$item.NetworkSettings.Networks;Mounts=$item.Mounts}
}
$inspections | ConvertTo-Json -Depth 12 | Set-Content docs/verification/docker/inspect.json
Invoke-TestCompose @('run','--rm','--no-deps','quality','node','--import','tsx','tests/fixtures/runtime-probe.ts') | Set-Content docs/verification/docker/http-proxy.log
$sandboxId=Invoke-TestCompose @('ps','-q','videoflow-media-sandbox')
Get-Content tests/fixtures/network-probe.ts -Raw | & docker @composeArgs exec -T videoflow-media-sandbox sh -c 'cat > /tmp/network-probe.ts'
if($LASTEXITCODE -ne 0) { throw 'Copy network probe failed' }
$dbId=Invoke-TestCompose @('ps','-q','videoflow-postgres')
$redisId=Invoke-TestCompose @('ps','-q','videoflow-redis')
$dbIp=(& docker inspect $dbId | ConvertFrom-Json)[0].NetworkSettings.Networks.PSObject.Properties.Value.IPAddress
$redisIp=(& docker inspect $redisId | ConvertFrom-Json)[0].NetworkSettings.Networks.PSObject.Properties.Value.IPAddress
Invoke-TestCompose @('exec','-T','videoflow-media-sandbox','node','--experimental-strip-types','/tmp/network-probe.ts',$dbIp,$redisIp) | Set-Content docs/verification/docker/network.log
$proxyUrl='http://' + [guid]::NewGuid().ToString() + ':spool@egress:3128'
Invoke-TestCompose @('exec','-T','videoflow-media-sandbox','yt-dlp','--ignore-config','--proxy',$proxyUrl,'--skip-download','--dump-single-json','--socket-timeout','2','--retries','0','http://fixture/video.mp4') | Set-Content docs/verification/docker/gateway-available.log
try {
  Invoke-TestCompose @('stop','videoflow-egress')
  & docker @composeArgs exec -T videoflow-media-sandbox yt-dlp --ignore-config --proxy $proxyUrl --skip-download --dump-single-json --socket-timeout 2 --retries 0 http://fixture/video.mp4 | Set-Content docs/verification/docker/gateway-unavailable.log
  $failedClosed=$LASTEXITCODE -ne 0
  if(!$failedClosed) { throw 'Media unexpectedly bypassed unavailable gateway' }
} finally { Invoke-TestCompose @('start','videoflow-egress') }
try {
  Invoke-TestCompose @('stop','videoflow-redis')
  Invoke-TestCompose @('exec','-T','videoflow-api','node','-e',"fetch('http://127.0.0.1:3000/api/health').then(r=>{console.log('API health with Redis stopped:',r.status);process.exit(r.status===503?0:1)})") | Set-Content docs/verification/docker/health-failure.log
} finally { Invoke-TestCompose @('start','videoflow-redis') }
Invoke-TestCompose @('up','-d','--wait')
Invoke-TestCompose @('exec','-T','videoflow-worker','node','workers/media-worker/dist/cleanup-main.js') | Set-Content docs/verification/docker/cleanup.log
Invoke-TestCompose @('ps','-a') | Set-Content docs/verification/docker/compose-ps.txt
Write-Output 'Runtime probes completed; inspect logs in docs/verification/docker.'
