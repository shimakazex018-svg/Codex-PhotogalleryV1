[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Scan', 'Recycle', 'Restore')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$RootPath,
    [Parameter(Mandatory = $true)][string]$LogsPath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$')][string]$JobId,
    [string]$CandidatePath = '',
    [string]$CancelPath = '',
    [string]$TrashPath = '',
    [switch]$ForceCopy,
    [string]$TestCopyFailurePattern = '',
    [string]$TestSourceDeleteFailurePattern = '',
    [int64]$TinyMediaBytes = 4096
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($true)
$root = [System.IO.Path]::GetFullPath($RootPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$logs = [System.IO.Path]::GetFullPath($LogsPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$prefix = Join-Path $logs "media-cleanup-$JobId"
$summaryPath = "$prefix-summary.json"
$nonMediaPath = "$prefix-non-media.csv"
$directoriesPath = "$prefix-directories.csv"
$zeroBytePath = "$prefix-zero-byte-media.csv"
$suspiciousPath = "$prefix-suspicious-media.csv"
$errorsPath = "$prefix-errors.csv"
$recordsPath = "$prefix-records.ndjson"
$progressPath = "$prefix-progress.json"
$logPath = "$prefix.log"
$trash = if ($TrashPath) { [System.IO.Path]::GetFullPath($TrashPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar) } else { '' }
$recycleJobRoot = if ($trash) { Join-Path $trash "media-cleanup\$JobId" } else { '' }
$recycleFilesRoot = if ($recycleJobRoot) { Join-Path $recycleJobRoot 'files' } else { '' }
$manifestPath = if ($recycleJobRoot) { Join-Path $recycleJobRoot 'manifest.ndjson' } else { '' }
$recycleSummaryPath = if ($recycleJobRoot) { Join-Path $recycleJobRoot 'summary.json' } else { '' }
$recycleLogPath = if ($recycleJobRoot) { Join-Path $recycleJobRoot 'recycle.log' } else { '' }

$imageExtensions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@('.jpg','.jpeg','.jpe','.jfif','.png','.webp','.gif','.bmp','.dib','.tif','.tiff','.heic','.heif','.avif','.jxl','.ico','.svg','.psd','.dng','.cr2','.cr3','.nef','.arw','.orf','.rw2','.raf','.pef','.srw','.x3f','.erf','.kdc','.mef','.mos','.mrw','.nrw','.rwl','.sr2','.srf') | ForEach-Object { [void]$imageExtensions.Add($_) }
$videoExtensions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@('.mp4','.m4v','.mov','.qt','.avi','.mkv','.wmv','.asf','.flv','.webm','.mpeg','.mpg','.mpe','.mpv','.m2v','.ts','.m2ts','.mts','.vob','.3gp','.3g2','.ogv','.rm','.rmvb','.divx','.mxf') | ForEach-Object { [void]$videoExtensions.Add($_) }
$archiveExtensions = @('.zip','.rar','.7z','.tar','.gz','.bz2','.xz','.tgz','.tbz','.tbz2','.txz')
$documentExtensions = @('.txt','.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.rtf','.md','.epub')
$sidecarExtensions = @('.xmp','.aae','.json','.xml','.nfo','.srt','.ass','.vtt','.cue','.lrc','.ini','.url','.html','.htm')
$temporaryExtensions = @('.tmp','.temp','.part','.partial','.crdownload','.download')
$executableExtensions = @('.exe','.msi','.dll','.bat','.cmd','.ps1','.vbs','.js','.py')

function Write-JsonAtomic([string]$Path, [object]$Value) {
    $temporary = "$Path.tmp"
    [System.IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 8 -Compress), $utf8)
    if ([System.IO.File]::Exists($Path)) { [System.IO.File]::Delete($Path) }
    [System.IO.File]::Move($temporary, $Path)
}

function Relative-Path([string]$BasePath, [string]$TargetPath) {
    $baseFull = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\') + '\'
    $targetFull = [System.IO.Path]::GetFullPath($TargetPath)
    $baseUri = [System.Uri]::new($baseFull)
    $targetUri = [System.Uri]::new($targetFull)
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', '\')
}

function Write-Log([string]$Message) {
    [System.IO.File]::AppendAllText($logPath, "$(Get-Date -Format o) $Message`r`n", $utf8)
    if ($recycleLogPath -and [System.IO.Directory]::Exists($recycleJobRoot)) {
        [System.IO.File]::AppendAllText($recycleLogPath, "$(Get-Date -Format o) $Message`r`n", $utf8)
    }
}

function Csv([object]$Value) {
    $text = if ($null -eq $Value) { '' } else { [string]$Value }
    return '"' + $text.Replace('"', '""').Replace("`r", ' ').Replace("`n", ' ') + '"'
}

function Is-InsideRoot([string]$Candidate, [switch]$AllowRoot) {
    $full = [System.IO.Path]::GetFullPath($Candidate).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    if ($AllowRoot -and [string]::Equals($full, $root, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $full.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Category-For([System.IO.FileInfo]$File) {
    $extension = $File.Extension.ToLowerInvariant()
    if ($File.Name -in @('Thumbs.db','desktop.ini','.DS_Store') -or $File.Name.StartsWith('._')) { return 'SystemJunk' }
    if (-not $extension) { return 'Extensionless' }
    if ($archiveExtensions -contains $extension) { return 'Archive' }
    if ($documentExtensions -contains $extension) { return 'Document' }
    if ($sidecarExtensions -contains $extension) { return 'MetadataOrSidecar' }
    if ($temporaryExtensions -contains $extension) { return 'TemporaryOrPartial' }
    if ($executableExtensions -contains $extension) { return 'ExecutableOrScript' }
    return 'Unknown'
}

function New-Summary([string]$Status) {
    [ordered]@{
        jobId=$JobId; status=$Status; rootPath=$root; startedAt=(Get-Date).ToUniversalTime().ToString('o'); finishedAt='';
        totalFiles=0L; scannedDirectories=0L; imageCount=0L; videoCount=0L; nonMediaCount=0L; nonMediaBytes=0L;
        emptyDirectoryCount=0L; leafNonMediaDirectoryCount=0L; mediaFreeTreeCount=0L; zeroByteMediaCount=0L;
        suspiciousTinyMediaCount=0L; reparsePointCount=0L; errorCount=0L; elapsedMilliseconds=0L; incomplete=$false;
        deletedFileCount=0L; deleteFailedFileCount=0L; deletedDirectoryCount=0L; deleteFailedDirectoryCount=0L; releasedBytes=0L;
        recyclePath=$recycleJobRoot; manifestPath=$manifestPath; sameVolume=$null; availableBytes=0L; requiredBytes=0L;
        pendingFileCount=0L; pendingBytes=0L; processedFileCount=0L; movedFileCount=0L; skippedFileCount=0L;
        changedSinceScanCount=0L; missingFileCount=0L; conflictRenamedCount=0L; copiedButSourceRetainedCount=0L;
        failedFileCount=0L; cleanedDirectoryCount=0L; failedDirectoryCount=0L; restorableFileCount=0L;
        restoredFileCount=0L; restoreConflictCount=0L; currentPath=''
    }
}

function Write-Progress([object]$Summary, [string]$CurrentPath) {
    $Summary.currentPath = $CurrentPath
    $progress = [ordered]@{ jobId=$JobId; status=$Summary.status; scannedFiles=$Summary.totalFiles; scannedDirectories=$Summary.scannedDirectories; imageCount=$Summary.imageCount; videoCount=$Summary.videoCount; nonMediaCount=$Summary.nonMediaCount; nonMediaBytes=$Summary.nonMediaBytes; errorCount=$Summary.errorCount; currentPath=$CurrentPath; updatedAt=(Get-Date).ToUniversalTime().ToString('o') }
    foreach ($name in @('pendingFileCount','pendingBytes','processedFileCount','movedFileCount','skippedFileCount','changedSinceScanCount','missingFileCount','conflictRenamedCount','copiedButSourceRetainedCount','failedFileCount','cleanedDirectoryCount','failedDirectoryCount','restorableFileCount','restoredFileCount','restoreConflictCount','availableBytes','requiredBytes','sameVolume','recyclePath','manifestPath')) { $progress[$name] = $Summary[$name] }
    Write-JsonAtomic $progressPath $progress
    if ($recycleSummaryPath -and [System.IO.Directory]::Exists($recycleJobRoot)) { Write-JsonAtomic $recycleSummaryPath $Summary }
}

function Append-Record([object]$Record) {
    [System.IO.File]::AppendAllText($recordsPath, ($Record | ConvertTo-Json -Compress) + "`n", $utf8)
}

function Append-ErrorRecord([string]$TargetPath, [string]$Type, [string]$Message, [bool]$CountAsError = $true) {
    if ($CountAsError) { $summary.errorCount++ }
    [System.IO.File]::AppendAllText($errorsPath, "$(Csv $TargetPath),$(Csv $Type),$(Csv $Message)`r`n", $utf8)
    $relative = if (Is-InsideRoot $TargetPath -AllowRoot) { Relative-Path $root $TargetPath } else { '' }
    Append-Record ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='error'; fullPath=$TargetPath; relativePath=$relative; category=$Type; message=$Message; sizeBytes=0 })
}

function Is-InsideTrash([string]$Candidate, [switch]$AllowRoot) {
    if (-not $trash) { return $false }
    $full = [System.IO.Path]::GetFullPath($Candidate).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    if ($AllowRoot -and [string]::Equals($full, $trash, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $full.StartsWith($trash + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Same-Volume([string]$Left, [string]$Right) {
    return [string]::Equals([System.IO.Path]::GetPathRoot($Left), [System.IO.Path]::GetPathRoot($Right), [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePath([string]$Candidate, [string]$Boundary) {
    $current = [System.IO.FileInfo]::new($Candidate)
    if ($current.Exists -and (($current.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'ReparsePoint is not processed.' }
    $parent = $current.Directory
    $boundaryFull = [System.IO.Path]::GetFullPath($Boundary).TrimEnd('\')
    while ($null -ne $parent -and $parent.FullName.Length -ge $boundaryFull.Length) {
        if (($parent.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'A parent directory is a ReparsePoint.' }
        if ([string]::Equals($parent.FullName.TrimEnd('\'), $boundaryFull, [System.StringComparison]::OrdinalIgnoreCase)) { return }
        $parent = $parent.Parent
    }
    throw 'Path does not resolve beneath the expected root.'
}

function Is-MediaExtension([string]$Extension) {
    return $imageExtensions.Contains($Extension) -or $videoExtensions.Contains($Extension)
}

function Append-Manifest([object]$Record) {
    [System.IO.File]::AppendAllText($manifestPath, ($Record | ConvertTo-Json -Depth 8 -Compress) + "`n", $utf8)
}

function Read-LatestManifest {
    $latest = @{}
    if (-not [System.IO.File]::Exists($manifestPath)) { return $latest }
    foreach ($line in [System.IO.File]::ReadLines($manifestPath, $utf8)) {
        if (-not $line.Trim()) { continue }
        try {
            $entry = $line.TrimStart([char]0xFEFF) | ConvertFrom-Json
            if ($entry.recordId) { $latest[[string]$entry.recordId] = $entry }
        } catch { Write-Log "Ignored malformed manifest line: $($_.Exception.Message)" }
    }
    return $latest
}

function New-ManifestEntry([object]$Record, [string]$Status, [string]$RecyclePath, [string]$IntendedPath, [string]$ErrorText, [string]$ConflictReason, [string]$ActualWriteTime, [string]$MovedAt, [string]$RestoredAt) {
    return [ordered]@{
        jobId=$JobId; recordId=[string]$Record.id; originalFullPath=[string]$Record.fullPath; originalRelativePath=[string]$Record.relativePath;
        recycleFullPath=$RecyclePath; intendedRecyclePath=$IntendedPath; category=[string]$Record.category; sizeBytes=[int64]$Record.sizeBytes;
        scanLastWriteTime=[string]$Record.lastWriteTime; actualLastWriteTime=$ActualWriteTime; originalAttributes=[string]$Record.attributes;
        status=$Status; error=$ErrorText; conflictReason=$ConflictReason; movedAt=$MovedAt; restoredAt=$RestoredAt;
        recordedAt=(Get-Date).ToUniversalTime().ToString('o')
    }
}

function Unique-RecyclePath([string]$IntendedPath, [string]$RecordId) {
    if (-not [System.IO.File]::Exists($IntendedPath) -and -not [System.IO.Directory]::Exists($IntendedPath)) { return $IntendedPath }
    $directory = [System.IO.Path]::GetDirectoryName($IntendedPath)
    $name = [System.IO.Path]::GetFileNameWithoutExtension($IntendedPath)
    $extension = [System.IO.Path]::GetExtension($IntendedPath)
    $shortId = if ($RecordId.Length -ge 8) { $RecordId.Substring(0,8) } else { [guid]::NewGuid().ToString('N').Substring(0,8) }
    $candidate = Join-Path $directory "$name.__recycle_$shortId$extension"
    $index = 1
    while ([System.IO.File]::Exists($candidate) -or [System.IO.Directory]::Exists($candidate)) {
        $candidate = Join-Path $directory "$name.__recycle_$shortId-$index$extension"
        $index++
    }
    return $candidate
}

function Remove-VerifiedSource([string]$SourcePath) {
    if ($TestSourceDeleteFailurePattern -and $SourcePath -like "*$TestSourceDeleteFailurePattern*") { throw 'Injected source delete failure.' }
    $attributes = [System.IO.File]::GetAttributes($SourcePath)
    $readOnly = ($attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0
    if ($readOnly) { [System.IO.File]::SetAttributes($SourcePath, ($attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly))) }
    try { [System.IO.File]::Delete($SourcePath) }
    catch {
        if ($readOnly -and [System.IO.File]::Exists($SourcePath)) { [System.IO.File]::SetAttributes($SourcePath, $attributes) }
        throw
    }
}

function Copy-Verify-Finalize([string]$SourcePath, [string]$DestinationPath, [int64]$ExpectedSize, [string]$ExpectedWriteTime) {
    $partial = "$DestinationPath.partial-$([guid]::NewGuid().ToString('N'))"
    try {
        if ($TestCopyFailurePattern -and $SourcePath -like "*$TestCopyFailurePattern*") { throw 'Injected copy failure.' }
        [System.IO.File]::Copy($SourcePath, $partial, $false)
        $sourceAfterCopy = [System.IO.FileInfo]::new($SourcePath)
        $partialInfo = [System.IO.FileInfo]::new($partial)
        if (-not $sourceAfterCopy.Exists -or -not $partialInfo.Exists -or $sourceAfterCopy.Length -ne $partialInfo.Length -or $partialInfo.Length -ne $ExpectedSize) { throw 'Copy size verification failed.' }
        if ($sourceAfterCopy.LastWriteTimeUtc.ToString('o') -ne $ExpectedWriteTime) { throw 'Source changed during copy.' }
        [System.IO.File]::Move($partial, $DestinationPath)
        $finalInfo = [System.IO.FileInfo]::new($DestinationPath)
        if (-not $finalInfo.Exists -or $finalInfo.Length -ne $ExpectedSize) { throw 'Final destination verification failed.' }
    } catch {
        if ([System.IO.File]::Exists($partial)) { [System.IO.File]::Delete($partial) }
        throw
    }
}

function Remove-EmptySourceDirectories([object]$Summary) {
    $directoryList=[System.Collections.Generic.List[string]]::new()
    $directoryStack=[System.Collections.Generic.Stack[string]]::new()
    $directoryStack.Push($root)
    while($directoryStack.Count -gt 0){
        $parent=$directoryStack.Pop()
        foreach($directory in [System.IO.Directory]::EnumerateDirectories($parent)){
            try {
                $info=[System.IO.DirectoryInfo]::new($directory)
                if(($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint)-ne 0){continue}
                $directoryList.Add($directory); $directoryStack.Push($directory)
            } catch { $Summary.failedDirectoryCount++; Write-Log "Directory enumerate failed: $directory :: $($_.Exception.Message)" }
        }
    }
    foreach($directory in ($directoryList | Sort-Object { ($_.Split([System.IO.Path]::DirectorySeparatorChar)).Count } -Descending)){
        $relativeDirectory=Relative-Path $root $directory
        try {
            $info=[System.IO.DirectoryInfo]::new($directory)
            if(($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint)-ne 0){continue}
            if(-not [System.IO.Directory]::EnumerateFileSystemEntries($directory).GetEnumerator().MoveNext()){
                [System.IO.Directory]::Delete($directory); $Summary.cleanedDirectoryCount++
                Write-Log "Empty source directory removed: $relativeDirectory"
            }
        } catch { $Summary.failedDirectoryCount++; Write-Log "Empty source directory cleanup failed: $relativeDirectory :: $($_.Exception.Message)" }
    }
}

function Write-OperationProgressIfDue([object]$Summary, [string]$RelativePath) {
    if ($Summary.processedFileCount % 10 -eq 0) { Write-Progress $Summary $RelativePath }
}

if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "PHOTOS_DIR does not exist: $root" }
if (-not (Test-Path -LiteralPath $logs -PathType Container)) { throw "Logs directory does not exist: $logs" }
if (-not (Is-InsideRoot $root -AllowRoot)) { throw 'Invalid root path.' }
if ($Mode -ne 'Scan') {
    if (-not $trash -or -not (Test-Path -LiteralPath $trash -PathType Container)) { throw 'Configured TRASH_DIR is required and must already exist.' }
    if (-not (Is-InsideTrash $recycleJobRoot)) { throw 'Recycle job path is outside TRASH_DIR.' }
    if (($ForceCopy -or $TestCopyFailurePattern -or $TestSourceDeleteFailurePattern) -and -not $root.StartsWith([System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Test hooks are only allowed beneath TEMP.' }
}

$initialStatus = if ($Mode -eq 'Scan') { 'scanning' } elseif ($Mode -eq 'Recycle') { 'recycling' } else { 'restoring' }
$summary = New-Summary $initialStatus
if ($Mode -ne 'Scan' -and [System.IO.File]::Exists($summaryPath)) {
    try {
        $prior = [System.IO.File]::ReadAllText($summaryPath, $utf8).TrimStart([char]0xFEFF) | ConvertFrom-Json
        @('totalFiles','scannedDirectories','imageCount','videoCount','nonMediaCount','nonMediaBytes','emptyDirectoryCount','leafNonMediaDirectoryCount','mediaFreeTreeCount','zeroByteMediaCount','suspiciousTinyMediaCount','reparsePointCount','errorCount') | ForEach-Object { $summary[$_] = $prior.$_ }
    } catch { throw 'Completed scan summary could not be read.' }
}
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    Write-Log "$Mode started for configured media root."
    if ($Mode -eq 'Scan') {
        [System.IO.File]::WriteAllText($nonMediaPath, 'Id,FullPath,RelativePath,ParentDirectory,FileName,Extension,Category,SizeBytes,CreationTime,LastWriteTime,Attributes' + "`r`n", $utf8)
        [System.IO.File]::WriteAllText($directoriesPath, 'Id,FullPath,RelativePath,Type,DescendantDirectoryCount,NonMediaFileCount,NonMediaBytes' + "`r`n", $utf8)
        [System.IO.File]::WriteAllText($zeroBytePath, 'FullPath,RelativePath,Extension,MediaType,SizeBytes' + "`r`n", $utf8)
        [System.IO.File]::WriteAllText($suspiciousPath, 'FullPath,RelativePath,Extension,MediaType,SizeBytes' + "`r`n", $utf8)
        [System.IO.File]::WriteAllText($errorsPath, 'Path,Type,Message' + "`r`n", $utf8)
        [System.IO.File]::WriteAllText($recordsPath, '', $utf8)

        $directoryRows = [System.Collections.Generic.List[object]]::new()
        $stack = [System.Collections.Generic.Stack[object]]::new()
        $nextProgressAt = 5000L
        $stack.Push([pscustomobject]@{ Path=$root; Visited=$false })
        while ($stack.Count -gt 0) {
            if ($CancelPath -and (Test-Path -LiteralPath $CancelPath)) { $summary.status='stopped'; $summary.incomplete=$true; break }
            $node = $stack.Pop()
            if (-not $node.Visited) {
                try {
                    $directoryInfo = [System.IO.DirectoryInfo]::new($node.Path)
                    if (($directoryInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                        $summary.reparsePointCount++; Append-ErrorRecord $node.Path 'ReparsePoint' 'Skipped and not followed' $false; continue
                    }
                    $summary.scannedDirectories++
                    $stack.Push([pscustomobject]@{ Path=$node.Path; Visited=$true })
                    $children = [System.IO.Directory]::EnumerateDirectories($node.Path)
                    foreach ($child in $children) { $stack.Push([pscustomobject]@{ Path=$child; Visited=$false }) }
                } catch {
                    Append-ErrorRecord $node.Path 'ScanError' $_.Exception.Message
                }
                continue
            }

            $directFiles=0L; $directMedia=0L; $directNonMedia=0L; $directNonMediaBytes=0L; $childCount=0L; $childPaths=@()
            try {
                $childPaths = @([System.IO.Directory]::EnumerateDirectories($node.Path))
                $childCount = $childPaths.Count
                foreach ($filePath in [System.IO.Directory]::EnumerateFiles($node.Path)) {
                    $directFiles++; $summary.totalFiles++
                    try {
                        $file = [System.IO.FileInfo]::new($filePath)
                        if (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { $summary.reparsePointCount++; Append-ErrorRecord $file.FullName 'ReparsePoint' 'Skipped and not followed' $false; continue }
                        $extension = $file.Extension.ToLowerInvariant()
                        $mediaType = if ($imageExtensions.Contains($extension)) { 'Image' } elseif ($videoExtensions.Contains($extension)) { 'Video' } else { '' }
                        $relative = Relative-Path $root $file.FullName
                        if ($file.FullName.Length -ge 240) { Append-ErrorRecord $file.FullName 'LongPath' 'Path length is near the Windows compatibility limit.' $false }
                        if ($mediaType) {
                            $directMedia++
                            if ($mediaType -eq 'Image') { $summary.imageCount++ } else { $summary.videoCount++ }
                            if ($file.Length -eq 0) {
                                $summary.zeroByteMediaCount++; [System.IO.File]::AppendAllText($zeroBytePath, "$(Csv $file.FullName),$(Csv $relative),$(Csv $extension),$(Csv $mediaType),$(Csv $file.Length)`r`n", $utf8)
                                Append-Record ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='zero-byte-media'; fullPath=$file.FullName; relativePath=$relative; fileName=$file.Name; extension=$extension; category=$mediaType; sizeBytes=$file.Length; lastWriteTime=$file.LastWriteTimeUtc.ToString('o') })
                            } elseif ($file.Length -lt $TinyMediaBytes) {
                                $summary.suspiciousTinyMediaCount++; [System.IO.File]::AppendAllText($suspiciousPath, "$(Csv $file.FullName),$(Csv $relative),$(Csv $extension),$(Csv $mediaType),$(Csv $file.Length)`r`n", $utf8)
                                Append-Record ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='suspicious-media'; fullPath=$file.FullName; relativePath=$relative; fileName=$file.Name; extension=$extension; category=$mediaType; sizeBytes=$file.Length; lastWriteTime=$file.LastWriteTimeUtc.ToString('o') })
                            }
                        } else {
                            $directNonMedia++; $directNonMediaBytes += $file.Length; $summary.nonMediaCount++; $summary.nonMediaBytes += $file.Length
                            $category = Category-For $file
                            $id = [guid]::NewGuid().ToString('N')
                            $row = @($id,$file.FullName,$relative,$file.DirectoryName,$file.Name,$extension,$category,$file.Length,$file.CreationTimeUtc.ToString('o'),$file.LastWriteTimeUtc.ToString('o'),[string]$file.Attributes) | ForEach-Object { Csv $_ }
                            [System.IO.File]::AppendAllText($nonMediaPath, ($row -join ',') + "`r`n", $utf8)
                            $record = [ordered]@{ id=$id; kind='non-media'; fullPath=$file.FullName; relativePath=$relative; parentDirectory=(Relative-Path $root $file.DirectoryName); fileName=$file.Name; extension=$extension; category=$category; sizeBytes=$file.Length; creationTime=$file.CreationTimeUtc.ToString('o'); lastWriteTime=$file.LastWriteTimeUtc.ToString('o'); attributes=[string]$file.Attributes }
                            Append-Record $record
                        }
                    } catch {
                        Append-ErrorRecord $filePath 'ScanError' $_.Exception.Message
                    }
                    if (($summary.totalFiles + $summary.scannedDirectories) -ge $nextProgressAt) { Write-Progress $summary (Relative-Path $root $node.Path); $nextProgressAt += 5000 }
                    if ($summary.totalFiles % 100 -eq 0 -and $CancelPath -and (Test-Path -LiteralPath $CancelPath)) { $summary.status='stopped'; $summary.incomplete=$true; break }
                }
                $directoryRows.Add([pscustomobject]@{ Path=$node.Path; ChildPaths=$childPaths; ChildCount=$childCount; DirectFiles=$directFiles; DirectMedia=$directMedia; DirectNonMedia=$directNonMedia; DirectNonMediaBytes=$directNonMediaBytes })
            } catch {
                Append-ErrorRecord $node.Path 'ScanError' $_.Exception.Message
            }
        }

        if ($summary.status -eq 'scanning') {
            $aggregate = @{}
            foreach ($directory in $directoryRows) {
                $relative = Relative-Path $root $directory.Path
                $descendants=0L; $media=$directory.DirectMedia; $nonMedia=$directory.DirectNonMedia; $bytes=$directory.DirectNonMediaBytes
                foreach ($childPath in $directory.ChildPaths) { $childKey=Relative-Path $root $childPath; if($aggregate.ContainsKey($childKey)){ $item=$aggregate[$childKey]; $descendants += 1 + $item.Descendants; $media += $item.Media; $nonMedia += $item.NonMedia; $bytes += $item.Bytes } }
                $aggregate[$relative]=[pscustomobject]@{ Descendants=$descendants; Media=$media; NonMedia=$nonMedia; Bytes=$bytes }
            }
            foreach ($directory in $directoryRows) {
                $relative = Relative-Path $root $directory.Path
                $item = $aggregate[$relative]
                $type = if ($directory.ChildCount -eq 0 -and $directory.DirectFiles -eq 0) { 'EmptyDirectory' } elseif ($directory.ChildCount -eq 0 -and $directory.DirectMedia -eq 0 -and $directory.DirectNonMedia -gt 0) { 'LeafNonMediaDirectory' } else { '' }
                if ($type -eq 'EmptyDirectory') { $summary.emptyDirectoryCount++ }
                if ($type -eq 'LeafNonMediaDirectory') { $summary.leafNonMediaDirectoryCount++ }
                $parentRelative = [System.IO.Path]::GetDirectoryName($relative)
                $parentMediaFree = $aggregate.ContainsKey([string]$parentRelative) -and $aggregate[[string]$parentRelative].Media -eq 0
                if (-not $type -and $item.Media -eq 0 -and $relative -ne '' -and -not $parentMediaFree) { $type='MediaFreeTree'; $summary.mediaFreeTreeCount++ }
                if ($type) {
                    $id=[guid]::NewGuid().ToString('N'); $row=@($id,$directory.Path,$relative,$type,$item.Descendants,$item.NonMedia,$item.Bytes)|ForEach-Object{Csv $_}; [System.IO.File]::AppendAllText($directoriesPath,($row -join ',')+"`r`n",$utf8)
                    $record=[ordered]@{id=$id;kind='directory';fullPath=$directory.Path;relativePath=$relative;category=$type;descendantDirectoryCount=$item.Descendants;nonMediaFileCount=$item.NonMedia;sizeBytes=$item.Bytes}; Append-Record $record
                }
            }
            $summary.status='completed'
        }
    } elseif ($Mode -eq 'Recycle') {
        if (-not $CandidatePath -or -not (Test-Path -LiteralPath $CandidatePath -PathType Leaf)) { throw 'Completed candidate report is required.' }
        if (-not $prior -or [string]$prior.jobId -ne $JobId -or [bool]$prior.incomplete -or [int64]$prior.errorCount -ne 0) { throw 'Candidate report is not a complete error-free scan.' }

        $latest = Read-LatestManifest
        $candidateCount = 0L; $candidateBytes = 0L
        foreach ($line in [System.IO.File]::ReadLines($CandidatePath, $utf8)) {
            if (-not $line.Trim()) { continue }
            $candidateRecord = $line.TrimStart([char]0xFEFF) | ConvertFrom-Json
            if ($candidateRecord.kind -eq 'non-media') { $candidateCount++; $candidateBytes += [int64]$candidateRecord.sizeBytes }
        }
        $summary.pendingFileCount = $candidateCount
        $summary.pendingBytes = $candidateBytes
        $summary.sameVolume = (Same-Volume $root $trash) -and -not $ForceCopy
        $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($trash))
        $summary.availableBytes = [int64]$drive.AvailableFreeSpace
        $summary.requiredBytes = [int64][Math]::Ceiling([Math]::Max([double]($candidateBytes + 2GB), [double]$candidateBytes * 1.1))
        if ($summary.availableBytes -lt $summary.requiredBytes) { throw "Insufficient recycle space. Required $($summary.requiredBytes) bytes; available $($summary.availableBytes) bytes." }

        [System.IO.Directory]::CreateDirectory($recycleFilesRoot) | Out-Null
        if (-not [System.IO.File]::Exists($manifestPath)) { [System.IO.File]::WriteAllText($manifestPath, '', $utf8) }
        Write-Progress $summary ''

        foreach ($line in [System.IO.File]::ReadLines($CandidatePath, $utf8)) {
            if (-not $line.Trim()) { continue }
            $record = $line.TrimStart([char]0xFEFF) | ConvertFrom-Json
            if ($record.kind -ne 'non-media') { continue }
            $summary.processedFileCount++
            $candidate = [System.IO.Path]::GetFullPath([string]$record.fullPath)
            $intended = [System.IO.Path]::GetFullPath((Join-Path $recycleFilesRoot ([string]$record.relativePath)))
            $actualWriteTime = ''; $errorText = ''; $conflictReason = ''; $actualDestination = $intended
            try {
                if (-not (Is-InsideRoot $candidate) -or [string]::Equals($candidate,$root,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Candidate is outside PHOTOS_DIR.' }
                if (-not (Is-InsideTrash $intended)) { throw 'Intended recycle target is outside TRASH_DIR.' }
                $previous = $latest[[string]$record.id]
                if ($previous -and $previous.status -in @('Moved','ConflictRenamed') -and -not [System.IO.File]::Exists($candidate) -and (Is-InsideTrash ([string]$previous.recycleFullPath)) -and [System.IO.File]::Exists([string]$previous.recycleFullPath)) {
                    $summary.skippedFileCount++; Write-OperationProgressIfDue $summary ([string]$record.relativePath); continue
                }
                $info = [System.IO.FileInfo]::new($candidate)
                if (-not $info.Exists) {
                    $entry = New-ManifestEntry $record 'Missing' '' $intended '' '' '' '' ''
                    Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.missingFileCount++; $summary.skippedFileCount++; Write-OperationProgressIfDue $summary ([string]$record.relativePath); continue
                }
                Assert-NoReparsePath $candidate $root
                $actualWriteTime = $info.LastWriteTimeUtc.ToString('o')
                if ($info.Length -ne [int64]$record.sizeBytes -or $actualWriteTime -ne [string]$record.lastWriteTime -or (Is-MediaExtension $info.Extension.ToLowerInvariant())) {
                    $entry = New-ManifestEntry $record 'ChangedSinceScan' '' $intended '' '' $actualWriteTime '' ''
                    Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.changedSinceScanCount++; $summary.skippedFileCount++; Write-OperationProgressIfDue $summary ([string]$record.relativePath); continue
                }

                if ($previous -and $previous.status -eq 'CopiedButSourceRetained' -and (Is-InsideTrash ([string]$previous.recycleFullPath)) -and [System.IO.File]::Exists([string]$previous.recycleFullPath)) {
                    $actualDestination = [string]$previous.recycleFullPath
                    try {
                        Remove-VerifiedSource $candidate
                        $status = if ([string]$previous.conflictReason) { 'ConflictRenamed' } else { 'Moved' }
                        $entry = New-ManifestEntry $record $status $actualDestination ([string]$previous.intendedRecyclePath) '' ([string]$previous.conflictReason) $actualWriteTime (Get-Date).ToUniversalTime().ToString('o') ''
                        Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.movedFileCount++; $summary.releasedBytes += [int64]$record.sizeBytes
                    } catch {
                        $entry = New-ManifestEntry $record 'CopiedButSourceRetained' $actualDestination ([string]$previous.intendedRecyclePath) $_.Exception.Message ([string]$previous.conflictReason) $actualWriteTime ([string]$previous.movedAt) ''
                        Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.copiedButSourceRetainedCount++; $summary.failedFileCount++
                    }
                    Write-OperationProgressIfDue $summary ([string]$record.relativePath); continue
                }

                $actualDestination = Unique-RecyclePath $intended ([string]$record.id)
                if (-not [string]::Equals($actualDestination,$intended,[System.StringComparison]::OrdinalIgnoreCase)) { $conflictReason='DestinationExists'; $summary.conflictRenamedCount++ }
                [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($actualDestination)) | Out-Null
                Append-Manifest (New-ManifestEntry $record 'Pending' $actualDestination $intended '' $conflictReason $actualWriteTime '' '')

                if ($summary.sameVolume) {
                    [System.IO.File]::Move($candidate, $actualDestination)
                } else {
                    Copy-Verify-Finalize $candidate $actualDestination ([int64]$record.sizeBytes) $actualWriteTime
                    try { Remove-VerifiedSource $candidate }
                    catch {
                        $entry = New-ManifestEntry $record 'CopiedButSourceRetained' $actualDestination $intended $_.Exception.Message $conflictReason $actualWriteTime (Get-Date).ToUniversalTime().ToString('o') ''
                        Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.copiedButSourceRetainedCount++; $summary.failedFileCount++; Write-OperationProgressIfDue $summary ([string]$record.relativePath); continue
                    }
                }
                $status = if ($conflictReason) { 'ConflictRenamed' } else { 'Moved' }
                $entry = New-ManifestEntry $record $status $actualDestination $intended '' $conflictReason $actualWriteTime (Get-Date).ToUniversalTime().ToString('o') ''
                Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.movedFileCount++; $summary.releasedBytes += [int64]$record.sizeBytes
            } catch {
                $errorText=$_.Exception.Message
                $entry = New-ManifestEntry $record 'Failed' $actualDestination $intended $errorText $conflictReason $actualWriteTime '' ''
                Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.failedFileCount++
            }
            Write-OperationProgressIfDue $summary ([string]$record.relativePath)
        }
        Remove-EmptySourceDirectories $summary
        $summary.restorableFileCount = @($latest.Values | Where-Object { $_.status -in @('Moved','ConflictRenamed') -and $_.recycleFullPath -and [System.IO.File]::Exists([string]$_.recycleFullPath) }).Count
        $summary.status = if ($summary.failedFileCount -or $summary.changedSinceScanCount -or $summary.missingFileCount -or $summary.copiedButSourceRetainedCount) { 'recycle-partial' } else { 'recycle-completed' }
    } else {
        if (-not [System.IO.File]::Exists($manifestPath)) { throw 'Recycle manifest was not found.' }
        $latest = Read-LatestManifest
        $restoreItems = @($latest.Values | Where-Object { $_.status -in @('Moved','ConflictRenamed','CopiedButSourceRetained','RestoreConflict') } | Sort-Object originalRelativePath)
        $summary.pendingFileCount = $restoreItems.Count
        $summary.pendingBytes = [int64](($restoreItems | Measure-Object -Property sizeBytes -Sum).Sum)
        $summary.sameVolume = (Same-Volume $root $trash) -and -not $ForceCopy
        [System.IO.Directory]::CreateDirectory($recycleJobRoot) | Out-Null
        foreach ($item in $restoreItems) {
            $summary.processedFileCount++
            $relative = [string]$item.originalRelativePath
            $original = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
            $recycleSource = [System.IO.Path]::GetFullPath([string]$item.recycleFullPath)
            $record = [pscustomobject]@{ id=[string]$item.recordId; fullPath=$original; relativePath=$relative; category=[string]$item.category; sizeBytes=[int64]$item.sizeBytes; lastWriteTime=[string]$item.scanLastWriteTime; attributes=[string]$item.originalAttributes }
            try {
                if (-not (Is-InsideRoot $original) -or -not (Is-InsideTrash $recycleSource) -or -not $recycleSource.StartsWith($recycleFilesRoot + '\',[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Restore path is outside its configured boundary.' }
                if ([System.IO.File]::Exists($original) -or [System.IO.Directory]::Exists($original)) {
                    $entry=New-ManifestEntry $record 'RestoreConflict' $recycleSource ([string]$item.intendedRecyclePath) 'Original path already exists.' 'OriginalExists' '' ([string]$item.movedAt) ''
                    Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.restoreConflictCount++; Write-OperationProgressIfDue $summary $relative; continue
                }
                if (-not [System.IO.File]::Exists($recycleSource)) { throw 'Recycled file is missing.' }
                Assert-NoReparsePath $recycleSource $recycleFilesRoot
                [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($original)) | Out-Null
                if ($summary.sameVolume) { [System.IO.File]::Move($recycleSource, $original) }
                else {
                    $recycleInfo=[System.IO.FileInfo]::new($recycleSource)
                    Copy-Verify-Finalize $recycleSource $original ([int64]$item.sizeBytes) $recycleInfo.LastWriteTimeUtc.ToString('o')
                    try { Remove-VerifiedSource $recycleSource }
                    catch {
                        $entry=New-ManifestEntry $record 'CopiedButSourceRetained' $recycleSource ([string]$item.intendedRecyclePath) $_.Exception.Message 'RestoreSourceRetained' '' ([string]$item.movedAt) ''
                        Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.copiedButSourceRetainedCount++; $summary.failedFileCount++; Write-OperationProgressIfDue $summary $relative; continue
                    }
                }
                try {
                    if ($record.lastWriteTime) { [System.IO.File]::SetLastWriteTimeUtc($original, [DateTimeOffset]::Parse($record.lastWriteTime).UtcDateTime) }
                    if ($record.attributes) { [System.IO.File]::SetAttributes($original, [System.Enum]::Parse([System.IO.FileAttributes], $record.attributes)) }
                } catch { Write-Log "Restored metadata could not be fully applied: $relative :: $($_.Exception.Message)" }
                $entry=New-ManifestEntry $record 'Restored' $recycleSource ([string]$item.intendedRecyclePath) '' '' ([string]$item.actualLastWriteTime) ([string]$item.movedAt) (Get-Date).ToUniversalTime().ToString('o')
                Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.restoredFileCount++
            } catch {
                $entry=New-ManifestEntry $record 'Failed' $recycleSource ([string]$item.intendedRecyclePath) $_.Exception.Message 'RestoreFailed' '' ([string]$item.movedAt) ''
                Append-Manifest $entry; $latest[[string]$record.id]=$entry; $summary.failedFileCount++
            }
            Write-OperationProgressIfDue $summary $relative
        }
        $summary.restorableFileCount = @($latest.Values | Where-Object { $_.status -in @('Moved','ConflictRenamed','RestoreConflict') -and $_.recycleFullPath -and [System.IO.File]::Exists([string]$_.recycleFullPath) }).Count
        $summary.status = if ($summary.failedFileCount -or $summary.restoreConflictCount -or $summary.copiedButSourceRetainedCount) { 'restore-partial' } else { 'restore-completed' }
    }
} catch {
    $summary.status='failed'; $summary.errorCount++; $summary.incomplete=$true
    try { [System.IO.File]::AppendAllText($errorsPath, "$(Csv $root),$(Csv 'Fatal'),$(Csv $_.Exception.Message)`r`n", $utf8) } catch {}
    Write-Log "Fatal: $($_.Exception.Message)"
    throw
} finally {
    $stopwatch.Stop(); $summary.elapsedMilliseconds=$stopwatch.ElapsedMilliseconds; $summary.finishedAt=(Get-Date).ToUniversalTime().ToString('o')
    Write-JsonAtomic $summaryPath $summary
    Write-Progress $summary ''
    if ($CancelPath -and (Test-Path -LiteralPath $CancelPath)) { Remove-Item -LiteralPath $CancelPath -Force -ErrorAction SilentlyContinue }
    Write-Log "$Mode finished with status $($summary.status)."
}
