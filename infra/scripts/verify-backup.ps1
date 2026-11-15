# Only creates a separate database in the isolated restore project.
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
$source=@('compose','-f','compose.yaml','-f','compose.test.yaml')
$restore=@('compose','-f','compose.restore.yaml')
New-Item -ItemType Directory -Force backups | Out-Null
$name='acceptance-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
& docker @source exec -T videoflow-postgres pg_dump -U videoflow -d videoflow -Fc -f /tmp/acceptance.dump
if($LASTEXITCODE -ne 0) { throw 'Backup failed' }
$encoded=& docker @source exec -T videoflow-postgres base64 /tmp/acceptance.dump
if($LASTEXITCODE -ne 0) { throw 'Backup read failed' }
[IO.File]::WriteAllBytes((Join-Path $PWD "backups/$name.dump"),[Convert]::FromBase64String(($encoded -join '')))
& docker @restore up -d --wait
if($LASTEXITCODE -ne 0) { throw 'Restore database unavailable' }
$encoded -join '' | & docker @restore exec -T restore-postgres sh -c 'base64 --decode --ignore-garbage > /tmp/restore.dump'
if($LASTEXITCODE -ne 0) { throw 'Restore upload failed' }
$database='restore_' + (Get-Date -Format 'yyyyMMddHHmmssfff')
& docker @restore exec -T restore-postgres createdb -U videoflow $database
& docker @restore exec -T restore-postgres pg_restore -U videoflow -d $database --exit-on-error /tmp/restore.dump
if($LASTEXITCODE -ne 0) { throw 'Restore failed' }
$query='SELECT json_build_object(''contexts'',(SELECT count(*) FROM "AnonymousContext"),''jobs'',(SELECT count(*) FROM "DownloadJob"),''artifacts'',(SELECT count(*) FROM "FileArtifact"));'
$before=$query | & docker @source exec -T videoflow-postgres psql -U videoflow -d videoflow -At
if($LASTEXITCODE -ne 0) { throw 'Source counts failed' }
$after=$query | & docker @restore exec -T restore-postgres psql -U videoflow -d $database -At
if($LASTEXITCODE -ne 0 -or $before -ne $after) { throw 'Restored count differs' }
@{Date=(Get-Date).ToUniversalTime().ToString('o');Backup="backups/$name.dump";Database=$database;JobsBefore=$before;JobsAfter=$after;ExitCode=0} | ConvertTo-Json | Set-Content docs/verification/docker/restore.json
& docker @restore stop
