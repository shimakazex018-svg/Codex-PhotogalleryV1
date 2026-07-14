[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Scan', 'Delete')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$RootPath,
    [Parameter(Mandatory = $true)][string]$LogsPath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$')][string]$JobId,
    [string]$CandidatePath = '',
    [string]$CancelPath = '',
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
$deletionPath = "$prefix-deletion.csv"
$deletionRecordsPath = "$prefix-deletion.ndjson"
$recordsPath = "$prefix-records.ndjson"
$progressPath = "$prefix-progress.json"
$logPath = "$prefix.log"

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
        deletedFileCount=0L; deleteFailedFileCount=0L; deletedDirectoryCount=0L; deleteFailedDirectoryCount=0L; releasedBytes=0L
    }
}

function Write-Progress([object]$Summary, [string]$CurrentPath) {
    Write-JsonAtomic $progressPath ([ordered]@{ jobId=$JobId; status=$Summary.status; scannedFiles=$Summary.totalFiles; scannedDirectories=$Summary.scannedDirectories; imageCount=$Summary.imageCount; videoCount=$Summary.videoCount; nonMediaCount=$Summary.nonMediaCount; nonMediaBytes=$Summary.nonMediaBytes; errorCount=$Summary.errorCount; currentPath=$CurrentPath; updatedAt=(Get-Date).ToUniversalTime().ToString('o') })
}

function Append-Record([object]$Record) {
    [System.IO.File]::AppendAllText($recordsPath, ($Record | ConvertTo-Json -Compress) + "`n", $utf8)
}

function Append-DeletionRecord([object]$Record) {
    [System.IO.File]::AppendAllText($deletionRecordsPath, ($Record | ConvertTo-Json -Compress) + "`n", $utf8)
}

function Append-ErrorRecord([string]$TargetPath, [string]$Type, [string]$Message, [bool]$CountAsError = $true) {
    if ($CountAsError) { $summary.errorCount++ }
    [System.IO.File]::AppendAllText($errorsPath, "$(Csv $TargetPath),$(Csv $Type),$(Csv $Message)`r`n", $utf8)
    $relative = if (Is-InsideRoot $TargetPath -AllowRoot) { Relative-Path $root $TargetPath } else { '' }
    Append-Record ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='error'; fullPath=$TargetPath; relativePath=$relative; category=$Type; message=$Message; sizeBytes=0 })
}

if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "PHOTOS_DIR does not exist: $root" }
if (-not (Test-Path -LiteralPath $logs -PathType Container)) { throw "Logs directory does not exist: $logs" }
if (-not (Is-InsideRoot $root -AllowRoot)) { throw 'Invalid root path.' }

$summary = New-Summary $(if ($Mode -eq 'Scan') { 'scanning' } else { 'deleting' })
if ($Mode -eq 'Delete' -and [System.IO.File]::Exists($summaryPath)) {
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
        [System.IO.File]::WriteAllText($deletionPath, 'Time,Type,RelativePath,SizeBytes,Result,Error' + "`r`n", $utf8)
        [System.IO.File]::WriteAllText($deletionRecordsPath, '', $utf8)
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
    } else {
        if (-not $CandidatePath -or -not (Test-Path -LiteralPath $CandidatePath -PathType Leaf)) { throw 'Completed candidate report is required.' }
        [System.IO.File]::WriteAllText($deletionPath, 'Time,Type,RelativePath,SizeBytes,Result,Error' + "`r`n", $utf8)
        [System.IO.File]::WriteAllText($deletionRecordsPath, '', $utf8)
        foreach ($line in [System.IO.File]::ReadLines($CandidatePath, $utf8)) {
            if (-not $line.Trim()) { continue }
            $record = $line | ConvertFrom-Json
            if ($record.kind -ne 'non-media') { continue }
            $result='Skipped'; $errorText=''; $size=[int64]$record.sizeBytes
            try {
                $candidate=[System.IO.Path]::GetFullPath([string]$record.fullPath)
                if (-not (Is-InsideRoot $candidate) -or [string]::Equals($candidate,$root,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Candidate is outside PHOTOS_DIR.' }
                $info=[System.IO.FileInfo]::new($candidate)
                if (-not $info.Exists) { $result='Missing' } elseif (($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'ReparsePoint is not deleted.' } else { [System.IO.File]::Delete($candidate); $summary.deletedFileCount++; $summary.releasedBytes += $size; $result='Deleted' }
            } catch { $summary.deleteFailedFileCount++; $result='Failed'; $errorText=$_.Exception.Message }
            [System.IO.File]::AppendAllText($deletionPath,"$(Csv (Get-Date).ToUniversalTime().ToString('o')),$(Csv 'File'),$(Csv $record.relativePath),$(Csv $size),$(Csv $result),$(Csv $errorText)`r`n",$utf8)
            Append-DeletionRecord ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='deletion'; category=$result; relativePath=$record.relativePath; sizeBytes=$size; message=$errorText; lastWriteTime=(Get-Date).ToUniversalTime().ToString('o') })
        }
        $directoryList=[System.Collections.Generic.List[string]]::new()
        $directoryStack=[System.Collections.Generic.Stack[string]]::new()
        $directoryStack.Push($root)
        while($directoryStack.Count -gt 0){
            $parent=$directoryStack.Pop()
            foreach($directory in [System.IO.Directory]::EnumerateDirectories($parent)){
                try { $info=[System.IO.DirectoryInfo]::new($directory); if(($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint)-ne 0){continue}; $directoryList.Add($directory); $directoryStack.Push($directory) }
                catch {
                    $summary.deleteFailedDirectoryCount++; $relativeDirectory=Relative-Path $root $directory
                    [System.IO.File]::AppendAllText($deletionPath,"$(Csv (Get-Date).ToUniversalTime().ToString('o')),$(Csv 'Directory'),$(Csv $relativeDirectory),$(Csv 0),$(Csv 'Failed'),$(Csv $_.Exception.Message)`r`n",$utf8)
                    Append-DeletionRecord ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='deletion'; category='FailedDirectory'; relativePath=$relativeDirectory; sizeBytes=0; message=$_.Exception.Message; lastWriteTime=(Get-Date).ToUniversalTime().ToString('o') })
                }
            }
        }
        $directories=$directoryList | Sort-Object { ($_.Split([System.IO.Path]::DirectorySeparatorChar)).Count } -Descending
        foreach($directory in $directories){
            try {
                $info=[System.IO.DirectoryInfo]::new($directory)
                if(($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint)-ne 0){continue}
                if(-not [System.IO.Directory]::EnumerateFileSystemEntries($directory).GetEnumerator().MoveNext()){
                    $relativeDirectory=Relative-Path $root $directory; [System.IO.Directory]::Delete($directory); $summary.deletedDirectoryCount++
                    [System.IO.File]::AppendAllText($deletionPath,"$(Csv (Get-Date).ToUniversalTime().ToString('o')),$(Csv 'Directory'),$(Csv $relativeDirectory),$(Csv 0),$(Csv 'Deleted'),$(Csv '')`r`n",$utf8)
                    Append-DeletionRecord ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='deletion'; category='DeletedDirectory'; relativePath=$relativeDirectory; sizeBytes=0; message=''; lastWriteTime=(Get-Date).ToUniversalTime().ToString('o') })
                }
            } catch {
                $summary.deleteFailedDirectoryCount++; $relativeDirectory=Relative-Path $root $directory
                [System.IO.File]::AppendAllText($deletionPath,"$(Csv (Get-Date).ToUniversalTime().ToString('o')),$(Csv 'Directory'),$(Csv $relativeDirectory),$(Csv 0),$(Csv 'Failed'),$(Csv $_.Exception.Message)`r`n",$utf8)
                Append-DeletionRecord ([ordered]@{ id=[guid]::NewGuid().ToString('N'); kind='deletion'; category='FailedDirectory'; relativePath=$relativeDirectory; sizeBytes=0; message=$_.Exception.Message; lastWriteTime=(Get-Date).ToUniversalTime().ToString('o') })
            }
        }
        $summary.status='delete-completed'
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
