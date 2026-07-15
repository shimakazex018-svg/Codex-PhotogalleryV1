[CmdletBinding()]
param([string]$NodePath = '')

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $PSScriptRoot 'media-library-cleanup-worker.ps1'
$root = Join-Path $env:TEMP "Codex-PhotogalleryV1-MediaCleanup-$([guid]::NewGuid().ToString('N'))"
$utf8 = [System.Text.UTF8Encoding]::new($true)

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function New-TestFile([string]$Base, [string]$Relative, [string]$Content, [switch]$ReadOnly) {
    $path = Join-Path $Base $Relative
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($path)) | Out-Null
    [System.IO.File]::WriteAllText($path, $Content, [System.Text.UTF8Encoding]::new($false))
    if ($ReadOnly) { [System.IO.File]::SetAttributes($path, [System.IO.FileAttributes]::ReadOnly) }
    return $path
}

function New-Record([string]$Photos, [string]$Path, [string]$Id) {
    $file = [System.IO.FileInfo]::new($Path)
    return [ordered]@{
        id=$Id; kind='non-media'; fullPath=$file.FullName; relativePath=$file.FullName.Substring($Photos.TrimEnd('\').Length + 1);
        parentDirectory=$file.DirectoryName.Substring($Photos.TrimEnd('\').Length).TrimStart('\'); fileName=$file.Name;
        extension=$file.Extension.ToLowerInvariant(); category='Document'; sizeBytes=$file.Length;
        creationTime=$file.CreationTimeUtc.ToString('o'); lastWriteTime=$file.LastWriteTimeUtc.ToString('o'); attributes=[string]$file.Attributes
    }
}

function Write-Report([string]$Photos, [string]$Logs, [string]$JobId, [object[]]$Records) {
    $prefix = Join-Path $Logs "media-cleanup-$JobId"
    $bytes = 0L
    foreach ($record in $Records) { $bytes += [int64]$record.sizeBytes }
    $summary = [ordered]@{ jobId=$JobId; status='completed'; rootPath=$Photos; startedAt=(Get-Date).ToUniversalTime().ToString('o'); finishedAt=(Get-Date).ToUniversalTime().ToString('o'); totalFiles=$Records.Count; scannedDirectories=1; imageCount=1; videoCount=1; nonMediaCount=$Records.Count; nonMediaBytes=$bytes; emptyDirectoryCount=0; leafNonMediaDirectoryCount=0; mediaFreeTreeCount=0; zeroByteMediaCount=0; suspiciousTinyMediaCount=0; reparsePointCount=0; errorCount=0; incomplete=$false }
    [System.IO.File]::WriteAllText("$prefix-summary.json", ($summary | ConvertTo-Json -Compress), $utf8)
    [System.IO.File]::WriteAllText("$prefix-records.ndjson", (($Records | ForEach-Object { $_ | ConvertTo-Json -Compress }) -join "`n") + "`n", $utf8)
    return "$prefix-records.ndjson"
}

function Invoke-Worker([string]$Mode, [string]$Photos, [string]$Logs, [string]$Trash, [string]$JobId, [string]$Records, [string[]]$Extra = @()) {
    $arguments = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$worker,'-Mode',$Mode,'-RootPath',$Photos,'-LogsPath',$Logs,'-TrashPath',$Trash,'-JobId',$JobId)
    if ($Mode -eq 'Recycle') { $arguments += @('-CandidatePath',$Records) }
    $arguments += $Extra
    & powershell.exe @arguments
    Assert ($LASTEXITCODE -eq 0) "$Mode worker exit code was $LASTEXITCODE"
}

try {
    $photos = Join-Path $root 'same-volume\photos'
    $logs = Join-Path $root 'same-volume\logs'
    $trash = Join-Path $root 'same-volume\trash'
    @($photos,$logs,$trash) | ForEach-Object { [System.IO.Directory]::CreateDirectory($_) | Out-Null }
    $job = '20990101-010101-aaaaaaaa'
    $specs = @(
        @('中文 路径\说明.txt','txt'), @('documents\manual.pdf','pdf'), @('metadata\data.json','json'),
        @('archives\pack.zip','zip'), @('archives\pack.7z','7z'), @('archives\pack.tar','tar'),
        @('zero\empty.txt',''), @('readonly\note.txt','readonly'), @('conflict\same.txt','source'),
        @('changed\changed.txt','before'), @('missing\missing.txt','missing')
    )
    $records = [System.Collections.Generic.List[object]]::new()
    $index = 0
    foreach ($spec in $specs) {
        $index++
        $path = New-TestFile $photos $spec[0] $spec[1] -ReadOnly:($spec[0] -like 'readonly*')
        $records.Add((New-Record $photos $path (('{0:x32}' -f $index))))
    }
    New-TestFile $photos 'media\keep.jpg' 'image' | Out-Null
    New-TestFile $photos 'media\keep.mp4' 'video' | Out-Null
    New-TestFile $photos 'late\after-scan.txt' 'late' | Out-Null
    $candidatePath = Write-Report $photos $logs $job $records
    [System.IO.File]::AppendAllText((Join-Path $photos 'changed\changed.txt'),'changed-after-scan')
    [System.IO.File]::Delete((Join-Path $photos 'missing\missing.txt'))
    New-TestFile (Join-Path $trash "media-cleanup\$job\files") 'conflict\same.txt' 'existing-target' | Out-Null

    Invoke-Worker 'Recycle' $photos $logs $trash $job $candidatePath
    $summary = Get-Content -Raw -Encoding UTF8 (Join-Path $trash "media-cleanup\$job\summary.json") | ConvertFrom-Json
    Assert ($summary.movedFileCount -eq 9) 'same-volume moved count'
    Assert ($summary.changedSinceScanCount -eq 1) 'ChangedSinceScan count'
    Assert ($summary.missingFileCount -eq 1) 'Missing count'
    Assert ($summary.conflictRenamedCount -eq 1) 'conflict rename count'
    Assert (Test-Path -LiteralPath (Join-Path $photos 'media\keep.jpg')) 'image must stay'
    Assert (Test-Path -LiteralPath (Join-Path $photos 'media\keep.mp4')) 'video must stay'
    Assert (Test-Path -LiteralPath (Join-Path $photos 'late\after-scan.txt')) 'late file must stay'
    Assert ((Get-ChildItem -LiteralPath (Join-Path $trash "media-cleanup\$job") -Recurse -Filter '*.partial-*' -Force).Count -eq 0) 'same-volume partial count'

    $manifestCount = (Get-Content -Encoding UTF8 (Join-Path $trash "media-cleanup\$job\manifest.ndjson")).Count
    Invoke-Worker 'Recycle' $photos $logs $trash $job $candidatePath
    $manifestAfterRetry = Get-Content -Encoding UTF8 (Join-Path $trash "media-cleanup\$job\manifest.ndjson")
    Assert ($manifestAfterRetry.Count -le ($manifestCount + 2)) 'idempotent retry must not duplicate moved files'

    New-TestFile $photos '中文 路径\说明.txt' 'restore-conflict' | Out-Null
    Invoke-Worker 'Restore' $photos $logs $trash $job ''
    $restoreSummary = Get-Content -Raw -Encoding UTF8 (Join-Path $trash "media-cleanup\$job\summary.json") | ConvertFrom-Json
    Assert ($restoreSummary.restoreConflictCount -eq 1) 'restore conflict count'
    Assert ((Get-Content -Raw -Encoding UTF8 (Join-Path $photos '中文 路径\说明.txt')) -eq 'restore-conflict') 'restore must not overwrite conflict'
    Assert ($restoreSummary.restoredFileCount -eq 8) 'restored file count'

    $copyPhotos = Join-Path $root 'copy\photos'
    $copyLogs = Join-Path $root 'copy\logs'
    $copyTrash = Join-Path $root 'copy\trash'
    @($copyPhotos,$copyLogs,$copyTrash) | ForEach-Object { [System.IO.Directory]::CreateDirectory($_) | Out-Null }
    $copyJob='20990101-020202-bbbbbbbb'
    $copyRecords=[System.Collections.Generic.List[object]]::new()
    foreach($name in @('ok.txt','copy-fail.txt','delete-fail.txt')) {
        $path=New-TestFile $copyPhotos $name $name
        $copyRecords.Add((New-Record $copyPhotos $path ([guid]::NewGuid().ToString('N'))))
    }
    $copyCandidate=Write-Report $copyPhotos $copyLogs $copyJob $copyRecords
    Invoke-Worker 'Recycle' $copyPhotos $copyLogs $copyTrash $copyJob $copyCandidate @('-ForceCopy','-TestCopyFailurePattern','copy-fail','-TestSourceDeleteFailurePattern','delete-fail')
    $copySummary=Get-Content -Raw -Encoding UTF8 (Join-Path $copyTrash "media-cleanup\$copyJob\summary.json") | ConvertFrom-Json
    Assert ($copySummary.movedFileCount -eq 1) 'forced-copy moved count'
    Assert ($copySummary.copiedButSourceRetainedCount -eq 1) 'source-retained count'
    Assert (Test-Path -LiteralPath (Join-Path $copyPhotos 'copy-fail.txt')) 'copy failure source retained'
    Assert (Test-Path -LiteralPath (Join-Path $copyPhotos 'delete-fail.txt')) 'delete failure source retained'
    Assert ((Get-ChildItem -LiteralPath (Join-Path $copyTrash "media-cleanup\$copyJob") -Recurse -Filter '*.partial-*' -Force).Count -eq 0) 'forced-copy partial count'

    if ($NodePath) {
        $apiRoot=Join-Path $root 'api'
        $apiPhotos=Join-Path $apiRoot 'photos'; $apiLogs=Join-Path $apiRoot 'data\logs'; $apiTrash=Join-Path $apiRoot 'trash'; $apiData=Join-Path $apiRoot 'data'
        @($apiPhotos,$apiLogs,$apiTrash) | ForEach-Object { [System.IO.Directory]::CreateDirectory($_) | Out-Null }
        $apiJob='20990101-030303-cccccccc'
        $apiFile=New-TestFile $apiPhotos 'api\candidate.txt' 'api-candidate'
        $apiRecords=@((New-Record $apiPhotos $apiFile ([guid]::NewGuid().ToString('N'))))
        Write-Report $apiPhotos $apiLogs $apiJob $apiRecords | Out-Null
        $listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0); $listener.Start(); $port=([System.Net.IPEndPoint]$listener.LocalEndpoint).Port; $listener.Stop()
        $saved=@{}
        foreach($name in @('PORT','HOST','DATA_DIR','PHOTOS_DIR','TRASH_DIR','ALLOW_REMOTE_DELETE','MEDIA_CLEANUP_ALLOWED_JOB_ID')) { $saved[$name]=[System.Environment]::GetEnvironmentVariable($name,'Process') }
        $env:PORT=[string]$port; $env:HOST='0.0.0.0'; $env:DATA_DIR=$apiData; $env:PHOTOS_DIR=$apiPhotos; $env:TRASH_DIR=$apiTrash; $env:ALLOW_REMOTE_DELETE='0'; $env:MEDIA_CLEANUP_ALLOWED_JOB_ID=$apiJob
        $stdout=Join-Path $apiRoot 'server.out.log'; $stderr=Join-Path $apiRoot 'server.err.log'
        $serverProcess=$null
        try {
            $serverProcess=Start-Process -FilePath $NodePath -ArgumentList 'server.js' -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
            $base="http://127.0.0.1:$port"
            $ready=$false
            for($attempt=0;$attempt -lt 50;$attempt++){ try { $null=Invoke-RestMethod "$base/api/media-cleanup/status" -TimeoutSec 2; $ready=$true; break } catch { Start-Sleep -Milliseconds 100 } }
            Assert $ready 'isolated API server readiness'
            $status=Invoke-RestMethod "$base/api/media-cleanup/status"
            Assert $status.canRecycle 'approved API job should be recyclable'

            try { Invoke-WebRequest "$base/api/media-cleanup/delete" -Method Post -ContentType 'application/json' -Body '{}' -UseBasicParsing | Out-Null; throw 'legacy delete unexpectedly succeeded' } catch { Assert ($_.Exception.Response.StatusCode.value__ -eq 410) 'legacy delete must return 410' }
            try { Invoke-WebRequest "$base/api/media-cleanup/recycle" -Method Post -ContentType 'application/json' -Body (@{jobId=$apiJob;confirmation='DELETE'}|ConvertTo-Json) -UseBasicParsing | Out-Null; throw 'bad recycle confirmation unexpectedly succeeded' } catch { Assert ($_.Exception.Response.StatusCode.value__ -eq 400) 'bad recycle confirmation must return 400' }

            $nonLoopback=[System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not [System.Net.IPAddress]::IsLoopback($_) } | Select-Object -First 1
            if ($nonLoopback) {
                $lanBase="http://$($nonLoopback.IPAddressToString):$port"
                try { Invoke-WebRequest "$lanBase/api/media-cleanup/recycle" -Method Post -ContentType 'application/json' -Body (@{jobId=$apiJob;confirmation='MOVE'}|ConvertTo-Json) -UseBasicParsing -TimeoutSec 5 | Out-Null; throw 'LAN recycle unexpectedly succeeded' } catch { Assert ($_.Exception.Response.StatusCode.value__ -eq 403) 'LAN recycle must return 403' }
                try { Invoke-WebRequest "$lanBase/api/media-cleanup/restore" -Method Post -ContentType 'application/json' -Body (@{jobId=$apiJob;confirmation='RESTORE'}|ConvertTo-Json) -UseBasicParsing -TimeoutSec 5 | Out-Null; throw 'LAN restore unexpectedly succeeded' } catch { Assert ($_.Exception.Response.StatusCode.value__ -eq 403) 'LAN restore must return 403' }
            }

            Invoke-RestMethod "$base/api/media-cleanup/recycle" -Method Post -ContentType 'application/json' -Body (@{jobId=$apiJob;confirmation='MOVE'}|ConvertTo-Json) | Out-Null
            for($attempt=0;$attempt -lt 100;$attempt++){ $status=Invoke-RestMethod "$base/api/media-cleanup/status"; if($status.status -notin @('recycling','restoring')){break}; Start-Sleep -Milliseconds 100 }
            Assert ($status.status -eq 'recycle-completed') 'localhost recycle completion'
            Assert (-not (Test-Path -LiteralPath $apiFile)) 'API candidate moved from source'
            Assert $status.canRestore 'API restore should be enabled'
            Invoke-RestMethod "$base/api/media-cleanup/restore" -Method Post -ContentType 'application/json' -Body (@{jobId=$apiJob;confirmation='RESTORE'}|ConvertTo-Json) | Out-Null
            for($attempt=0;$attempt -lt 100;$attempt++){ $status=Invoke-RestMethod "$base/api/media-cleanup/status"; if($status.status -notin @('recycling','restoring')){break}; Start-Sleep -Milliseconds 100 }
            Assert ($status.status -eq 'restore-completed') 'localhost restore completion'
            Assert (Test-Path -LiteralPath $apiFile) 'API candidate restored'
        } finally {
            if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force; $serverProcess.WaitForExit() }
            foreach($name in $saved.Keys) { [System.Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
        }
    }

    Write-Output 'MEDIA_CLEANUP_RECYCLE_TEST=PASS'
} finally {
    if (Test-Path -LiteralPath $root) {
        Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { try { $_.IsReadOnly=$false } catch {} }
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Output "TEMP_ROOT_EXISTS=$(Test-Path -LiteralPath $root)"
}
