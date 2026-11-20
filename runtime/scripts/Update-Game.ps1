param([switch]$CheckOnly, [string]$SourceGamePath)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$server = Join-Path $base 'server'
$backups = Join-Path $base 'backups'
$gi = 'game\csgo\gameinfo.gi'
$versionFile = 'game\csgo\steam.inf'
$exe = 'game\bin\win64\cs2.exe'

function Assert-NoLink([string]$path) {
    while ($path) {
        if (Test-Path -LiteralPath $path) {
            if ((Get-Item -Force -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "目录或文件使用了重解析点，无法安全同步：$path"
            }
        }
        $path = [IO.Path]::GetDirectoryName($path)
    }
}

function Get-Digest([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToBase64String($sha.ComputeHash($stream)) }
    finally { $sha.Dispose(); $stream.Dispose() }
}

function Clear-UpdateBatch {
    try {
        Assert-NoLink $archive
        $path = (Resolve-Path -LiteralPath $archive).ProviderPath
        $root = (Resolve-Path -LiteralPath $archiveRoot).ProviderPath
        if ([IO.Path]::GetDirectoryName($path) -ine $root -or [IO.Path]::GetFileName($path) -cne $batchName) {
            throw '临时备份路径与当前更新批次不符。'
        }
        $dirs = [Collections.Generic.Stack[IO.DirectoryInfo]]::new()
        $dirs.Push([IO.DirectoryInfo]::new($path))
        while ($dirs.Count) {
            foreach ($item in $dirs.Pop().EnumerateFileSystemInfos()) {
                if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "备份内含链接：$($item.FullName)" }
                if ($item -is [IO.DirectoryInfo]) { $dirs.Push($item) }
            }
        }
        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Warning "临时备份清理未完成，目录为 $archive。原因：$_"
    }
}

function Get-SteamBuild {
    $acf = [IO.File]::ReadAllText($manifest)
    $fields = @{}
    foreach ($m in [regex]::Matches($acf, '(?m)^\s*"(appid|installdir|StateFlags|buildid)"\s+"([^"]+)"')) {
        $fields[$m.Groups[1].Value] = $m.Groups[2].Value
    }
    if ($fields.appid -ne '730' -or $fields.installdir -ne (Split-Path -Leaf $source) -or
        $fields.StateFlags -ne '4' -or $fields.buildid -notmatch '^\d+$') {
        throw 'Steam 尚未完成此 CS2 安装的更新。请在 Steam 下载页确认完成后重试。'
    }
    return $fields.buildid
}

function Add-Metamod([string]$vanilla) {
    $anchor = [regex]'(?im)^([ \t]*)(Game_LowViolence[ \t]+csgo_lv\b[^\r\n]*)(\r?\n)'
    if ($anchor.Matches($vanilla).Count -ne 1 -or $vanilla -match '(?im)^\s*Game\s+csgo/addons/metamod\b') {
        throw '新版 gameinfo.gi 的搜索路径需要人工检查。'
    }
    return $anchor.Replace($vanilla, { param($m)
        return $m.Value + $m.Groups[1].Value + "Game" + [char]9 + 'csgo/addons/metamod' + $m.Groups[3].Value
    })
}

$config = $null
$settings = Join-Path $base 'data\settings.json'
if (Test-Path -LiteralPath $settings) { $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $settings | ConvertFrom-Json }
if (!$SourceGamePath) {
    if ($config) {
        $SourceGamePath = $config.sourceGamePath
    } else {
        $old = Get-Content -Raw -Encoding UTF8 -LiteralPath "$backups\original-game-hashes.json" | ConvertFrom-Json
        $entry = @($old | Where-Object { $_.Path -like "*\$gi" }) | Select-Object -First 1
        if ($entry) { $SourceGamePath = $entry.Path.Substring(0, $entry.Path.Length - $gi.Length - 1) }
    }
}
if (!$SourceGamePath -or !(Test-Path -LiteralPath $SourceGamePath -PathType Container)) {
    throw '找不到 Steam 游戏目录。可用 -SourceGamePath 指定 Steam 库中 CS2 的目录。'
}
$source = (Get-Item -LiteralPath $SourceGamePath).FullName.TrimEnd('\')
Assert-NoLink $source
Assert-NoLink $server
Assert-NoLink $backups
if (($base+'\').StartsWith($source+'\', [StringComparison]::OrdinalIgnoreCase) -or
    ($source+'\').StartsWith($base+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Steam 原版与检视服目录必须独立。' }
if (!(Test-Path -LiteralPath "$source\$exe" -PathType Leaf) -or
    !(Test-Path -LiteralPath "$server\game\csgo\addons\metamod" -PathType Container)) { throw '原版游戏或检视服路径不完整。' }
$manifest = Join-Path (Split-Path -Parent (Split-Path -Parent $source)) 'appmanifest_730.acf'
$build = Get-SteamBuild
$mutex = [Threading.Mutex]::new($false, 'Local\CS2InspectGameUpdate')
$owned = $false
try {
    try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
    if (!$owned) { throw '另一个检视服更新正在进行。' }

    $upstreamPath = Join-Path $backups 'gameinfo-upstream.gi'
    $reference = $upstreamPath
    if (!(Test-Path -LiteralPath $reference)) { $reference = Join-Path $backups 'server-gameinfo-original.gi' }
    foreach ($path in @("$source\$gi","$source\$versionFile","$server\$gi",$reference,$upstreamPath)) { Assert-NoLink $path }
    $oldGi = [IO.File]::ReadAllText($reference)
    $newGi = [IO.File]::ReadAllText("$source\$gi")
    $localGi = if ([IO.File]::Exists("$server\$gi")) { [IO.File]::ReadAllText("$server\$gi") } else { '' }
    $merged = Add-Metamod $newGi
    $legacyGi = [regex]::Replace($oldGi,'(Game_LowViolence\s+csgo_lv)', {
        param($m) return $m.Value + [Environment]::NewLine + ([string][char]9)*3 + 'Game' + [char]9 + 'csgo/addons/metamod'
    })
    $entries = [Collections.Generic.List[object]]::new()
    function Add-Entry($from, $to, $name, $content) {
        $entries.Add([pscustomobject]@{From=$from; To=$to; Name=$name; Content=$content; HadOriginal=$false})
    }
    if ($oldGi -cne $newGi -or $localGi -notmatch '(?im)^[ \t]*Game[ \t]+csgo/addons/metamod\b') {
        if ($localGi -cne $merged) {
            if ($localGi -and $localGi -cne $oldGi -and $localGi -cne $newGi -and
                $localGi -cne $legacyGi -and $localGi -cne (Add-Metamod $oldGi)) {
                throw '服务端 gameinfo.gi 有自定义内容，需要人工合并。本次尚未复制文件。'
            }
            Add-Entry $null "$server\$gi" "server\$gi" $merged
        }
        if ($oldGi -cne $newGi) { Add-Entry "$source\$gi" $upstreamPath 'backups\gameinfo-upstream.gi' $null }
    }
    $inf = [IO.File]::ReadAllText("$source\$versionFile")
    if ($inf -notmatch '(?m)^PatchVersion=([^\r\n]+)' -or $inf -notmatch '(?m)^ServerVersion=\d+\s*$') { throw 'Steam 中的 CS2 版本文件不完整。' }
    $version = [regex]::Match($inf,'(?m)^PatchVersion=([^\r\n]+)').Groups[1].Value
    Write-Host "正在检查 Steam CS2 $version（Build $build）与本地检视服的差异……"
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push('')
    while ($pending.Count) {
        $rel = $pending.Pop()
        foreach ($item in [IO.DirectoryInfo]::new([IO.Path]::Combine($source,$rel)).EnumerateFileSystemInfos()) {
            $r = [IO.Path]::Combine($rel,$item.Name)
            if ($item.Name -match '^(addons|_iconcache|save|replays|rpt|logs|screenshots|workshop)$|^~vss' -or
                $r -match '\.(log|dmp|iic|dem)$|(^|\\)ServerConfig\.vdf$|^game\\csgo\\cfg\\(server|inspect_server|autoexec|gamemode_.+_server)\.cfg$' -or $r -eq $gi) { continue }
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "原版目录含链接，请检查：$r" }
            $dst = Join-Path $server $r
            if (([IO.File]::Exists($dst) -or [IO.Directory]::Exists($dst)) -and
                ([IO.File]::GetAttributes($dst) -band [IO.FileAttributes]::ReparsePoint)) { throw "检视服目录含链接，请检查：$r" }
            if ($item -is [IO.DirectoryInfo]) {
                if ([IO.File]::Exists($dst)) { throw "目标目录被同名文件占用：$r" }
                $pending.Push($r)
                continue
            }
            if ([IO.Directory]::Exists($dst)) { throw "目标文件被同名目录占用：$r" }
            $file = [IO.FileInfo]::new($dst)
            if ($r -eq $versionFile) { continue }
            if ($file.Exists -and $file.Length -eq $item.Length) {
                if ($file.LastWriteTimeUtc -eq $item.LastWriteTimeUtc) { continue }
                if ((Get-Digest $item.FullName) -ceq (Get-Digest $dst)) { continue }
            }
            Add-Entry $item.FullName $dst "server\$r" $null
        }
    }
    $serverInf = Join-Path $server $versionFile
    if (![IO.File]::Exists($serverInf) -or [IO.File]::ReadAllText($serverInf) -cne $inf) {
        Add-Entry "$source\$versionFile" $serverInf "server\$versionFile" $null
    }
    if ((Get-SteamBuild) -ne $build) { throw '扫描期间 Steam 版本发生变化，请重新运行。' }
    if (!$entries.Count) { Write-Host "检视服已是 $version，无需复制。"; return }
    $bytes = 0L
    $backupBytes = 0L
    $growth = 0L
    foreach ($e in $entries) {
        $size = if ($e.From) { [IO.FileInfo]::new($e.From).Length } else { [Text.Encoding]::UTF8.GetByteCount($e.Content) }
        $oldSize = if ([IO.File]::Exists($e.To)) { [IO.FileInfo]::new($e.To).Length } else { 0L }
        $bytes += $size
        $backupBytes += $oldSize
        $growth += [Math]::Max(0L, [long]($size - $oldSize))
    }
    Write-Host ('需同步 {0} 个文件，共 {1:N2} GiB。' -f $entries.Count, ($bytes / 1GB))
    if ($CheckOnly) { $entries | ForEach-Object { Write-Output $_.Name }; return }

    function Assert-Stopped {
        foreach ($p in @(Get-Process -Name cs2 -ErrorAction SilentlyContinue)) {
            if (!$p.Path -or $p.Path -in @("$server\$exe","$source\$exe")) { throw '请先退出 CS2，并在检视网页停止检视服务，再运行更新。' }
        }
    }
    Assert-Stopped
    $tempRoot = if ($config.tempRoot) { $config.tempRoot } else { 'D:\codex' }
    $archiveRoot = [IO.Path]::GetFullPath((Join-Path $tempRoot 'cs2-inspect-game-updates'))
    foreach ($protected in @($source,$server)) {
        if (($archiveRoot+'\').StartsWith($protected+'\', [StringComparison]::OrdinalIgnoreCase)) { throw '临时备份目录位于游戏目录中。' }
    }
    Assert-NoLink $archiveRoot
    $serverDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($base))
    $backupDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($archiveRoot))
    if ($serverDrive.Name -eq $backupDrive.Name) { $growth += $backupBytes }
    if ($serverDrive.AvailableFreeSpace -lt ($growth + 32MB)) { throw '检视服所在磁盘空间不足。' }
    if ($backupDrive.AvailableFreeSpace -lt ($backupBytes + 32MB)) { throw "临时备份所在磁盘空间不足：$archiveRoot" }
    $batchName = "$build-" + [guid]::NewGuid().ToString('N')
    $archive = Join-Path $archiveRoot $batchName
    [IO.Directory]::CreateDirectory($archive) | Out-Null
    Write-Host "本次临时备份：$archive"
    $applied = [Collections.Generic.Stack[object]]::new()
    try {
        [IO.File]::WriteAllLines("$archive\files.txt", [string[]]@($entries | ForEach-Object { $_.Name }))
        $index = 0
        foreach ($e in $entries) {
            $index++
            Write-Progress -Activity '同步并校验 CS2 检视服' -Status "$index / $($entries.Count)  $($e.Name)" -PercentComplete (100*$index/$entries.Count)
            $old = Join-Path $archive $e.Name
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($e.To)) | Out-Null
            if ([IO.File]::Exists($e.To)) {
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($old)) | Out-Null
                [IO.File]::Copy($e.To,$old)
                if ((Get-Digest $old) -cne (Get-Digest $e.To)) { throw "临时备份校验失败：$($e.Name)" }
                $attrs = [IO.File]::GetAttributes($e.To)
                $readOnly = $attrs -band [IO.FileAttributes]::ReadOnly
                if ($readOnly) { [IO.File]::SetAttributes($e.To, ($attrs -bxor [IO.FileAttributes]::ReadOnly)) }
                try { [IO.File]::Delete($e.To) } catch {
                    if ($readOnly) { [IO.File]::SetAttributes($e.To,$attrs) }
                    throw
                }
                $e.HadOriginal = $true
            }
            $applied.Push($e)
            if ($e.From) {
                [IO.File]::Copy($e.From,$e.To)
                if ((Get-Digest $e.From) -cne (Get-Digest $e.To)) { throw "校验失败：$($e.Name)" }
            } else {
                [IO.File]::WriteAllText($e.To,$e.Content,[Text.UTF8Encoding]::new($false))
                if ([IO.File]::ReadAllText($e.To) -cne $e.Content) { throw "写入校验失败：$($e.Name)" }
            }
        }
        if ((Get-SteamBuild) -ne $build) { throw '同步期间 Steam 版本发生变化，请重新运行。' }
    } catch {
        $failure = $_
        $unrestored = @()
        while ($applied.Count) {
            $e = $applied.Pop()
            $old = Join-Path $archive $e.Name
            try {
                if ([IO.File]::Exists($e.To)) {
                    [IO.File]::SetAttributes($e.To, [IO.FileAttributes]::Normal)
                    [IO.File]::Delete($e.To)
                }
                if ($e.HadOriginal) {
                    [IO.File]::Copy($old,$e.To)
                    if ((Get-Digest $old) -cne (Get-Digest $e.To)) { throw "回滚校验失败：$($e.Name)" }
                }
            } catch { $unrestored += $e.Name }
        }
        if ($unrestored.Count) { throw "更新失败：$failure。需要从 $archive 手动恢复：$($unrestored -join ', ')" }
        Clear-UpdateBatch
        throw $failure
    } finally { Write-Progress -Activity '同步并校验 CS2 检视服' -Completed }
    Clear-UpdateBatch
    Write-Host "更新完成，已校验 $($entries.Count) 个文件。现在可以启动检视。"
} finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
