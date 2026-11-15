$ErrorActionPreference='Stop'
$RepoRoot=Split-Path -Parent $PSScriptRoot
function Read-DeploymentConfig([string]$ConfigPath) {
    if(!$ConfigPath){$ConfigPath=Join-Path $RepoRoot 'deploy.local.psd1'}
    if(!(Test-Path -LiteralPath $ConfigPath)){throw 'Copy deploy.config.example.psd1 to deploy.local.psd1 and edit it first.'}
    $config=Import-PowerShellDataFile -LiteralPath $ConfigPath
    foreach($name in @('InstallRoot','TempRoot')){
        if(!$config[$name] -or $config[$name] -notmatch '^[A-Za-z]:\\'){throw "$name must be an absolute local Windows path."}
        $config[$name]=[IO.Path]::GetFullPath($config[$name]).TrimEnd('\')
        if($config[$name].Length -le 3){throw "$name must not be a drive root."}
        if($config[$name] -match '["\r\n]'){throw "Invalid character in $name"}
    }
    if(!$config.PackageRoot){$config.PackageRoot=Join-Path $RepoRoot 'packages'}
    $config.PackageRoot=[IO.Path]::GetFullPath($config.PackageRoot)
    $steam=Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue
    if(!$config.SteamExe -and $steam.SteamPath){$config.SteamExe=Join-Path $steam.SteamPath 'steam.exe'}
    if(!$config.SteamExe -or !(Test-Path -LiteralPath $config.SteamExe -PathType Leaf)){throw 'Steam not found. Set SteamExe to the real steam.exe path.'}
    $config.SteamExe=(Resolve-Path -LiteralPath $config.SteamExe).Path
    if(!$config.SourceGamePath){
        $steamHome=Split-Path -Parent $config.SteamExe
        $libraries=@($steamHome)
        $vdf=Join-Path $steamHome 'steamapps\libraryfolders.vdf'
        if(Test-Path -LiteralPath $vdf){$text=Get-Content -Encoding UTF8 -LiteralPath $vdf -Raw;$libraries+=@([regex]::Matches($text,'"path"\s+"([^"]+)"')|ForEach-Object {$_.Groups[1].Value.Replace('\\','\')})}
        $games=@($libraries|ForEach-Object {[IO.Path]::GetFullPath($_).TrimEnd('\').ToLowerInvariant()}|Select-Object -Unique|ForEach-Object {Join-Path $_ 'steamapps\common\Counter-Strike Global Offensive'}|Where-Object {Test-Path -LiteralPath (Join-Path $_ 'game\bin\win64\cs2.exe')})
        if($games.Count -ne 1){throw 'Could not identify one CS2 installation. Set SourceGamePath explicitly.'}
        $config.SourceGamePath=$games[0]
    }
    $config.SourceGamePath=(Resolve-Path -LiteralPath $config.SourceGamePath).Path.TrimEnd('\')
    foreach($name in @('InstallRoot','TempRoot','PackageRoot')){
        if(Test-PathOverlap $config[$name] $config.SourceGamePath){throw "$name overlaps the original game. Refusing."}
    }
    if(Test-PathOverlap $config.InstallRoot $RepoRoot){throw 'InstallRoot must be separate from the repository.'}
    if(Test-PathOverlap $config.InstallRoot $config.PackageRoot){throw 'InstallRoot must be separate from PackageRoot.'}
    foreach($relative in @('game\bin\win64\cs2.exe','game\csgo\gameinfo.gi','game\csgo\bin\win64\server.dll','game\csgo\bin\win64\client.dll')){
        if(!(Test-Path -LiteralPath (Join-Path $config.SourceGamePath $relative) -PathType Leaf)){throw "Missing original game file: $relative"}
    }
    if((Get-Content -Encoding UTF8 -LiteralPath (Join-Path $config.SourceGamePath 'game\csgo\gameinfo.gi') -Raw) -match 'Game\s+csgo/addons/metamod'){throw 'The original game already loads Metamod. Use a clean Steam client as the source.'}
    if(!$config.SteamId){
        $active=(Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam\ActiveProcess' -ErrorAction SilentlyContinue).ActiveUser
        if(!$active){throw 'Log into Steam, or set your 17-digit SteamId in deploy.local.psd1.'}
        $config.SteamId=([uint64]76561197960265728+[uint64]$active).ToString()
    }
    if([string]$config.SteamId -notmatch '^7656119\d{10}$'){throw 'SteamId must be a 17-digit SteamID64.'}
    return $config
}
function Test-PathOverlap([string]$First,[string]$Second){
    $a=[IO.Path]::GetFullPath($First).TrimEnd('\')+'\'
    $b=[IO.Path]::GetFullPath($Second).TrimEnd('\')+'\'
    return $a.StartsWith($b,[StringComparison]::OrdinalIgnoreCase) -or $b.StartsWith($a,[StringComparison]::OrdinalIgnoreCase)
}
function Write-Utf8([string]$Path,[string]$Text){[IO.File]::WriteAllText($Path,$Text,[Text.UTF8Encoding]::new($false))}
function Read-PackageLock { Get-Content -Encoding UTF8 -LiteralPath (Join-Path $RepoRoot 'packages.lock.json') -Raw | ConvertFrom-Json }
function Test-PackageFiles([string]$Directory) {
    foreach($package in (Read-PackageLock).packages | Where-Object {$_.required}){
        $file=Join-Path $Directory $package.file
        if(!(Test-Path -LiteralPath $file)){throw "Missing package: $file. Run deploy\Get-Packages.ps1 first."}
        if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $package.sha256){throw "SHA256 mismatch: $($package.file). Do not extract this file."}
        Write-Host "Verified $($package.file)"
    }
}
function Expand-VerifiedArchive([string]$Archive,[string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $destinationPrefix=[IO.Path]::GetFullPath($Destination).TrimEnd('\')+'\'
    $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
    try{foreach($entry in $zip.Entries){
        $entryPath=[IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
        if(!$entryPath.StartsWith($destinationPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive entry escapes its destination.'}
    }}finally{$zip.Dispose()}
    Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
}
function Get-OriginalHashes([string]$GameRoot){
    foreach($relative in @('game\csgo\gameinfo.gi','game\bin\win64\cs2.exe','game\csgo\bin\win64\server.dll','game\csgo\bin\win64\client.dll')){
        [pscustomobject]@{relative=$relative;sha256=(Get-FileHash -LiteralPath (Join-Path $GameRoot $relative) -Algorithm SHA256).Hash}
    }
}
