param([string]$ConfigPath)
. "$PSScriptRoot\Common.ps1"
if(![Environment]::Is64BitOperatingSystem){throw 'Windows x64 is required.'}
$config=Read-DeploymentConfig $ConfigPath
$base=$config.InstallRoot
if((Test-Path -LiteralPath $base) -and @(Get-ChildItem -LiteralPath $base -Force).Count){throw 'InstallRoot must be empty. Existing deployments are never overwritten by Install.ps1.'}
foreach($port in @(3307,17830,27015)){
    if(@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count){throw "TCP port $port is occupied. Stop the owning service before installing."}
}
Test-PackageFiles $config.PackageRoot
$bridge=Get-Content -Encoding UTF8 -LiteralPath "$RepoRoot\extensions\LocalInspectBridge\build-info.json" -Raw | ConvertFrom-Json
$bridgeDll="$RepoRoot\extensions\LocalInspectBridge\prebuilt\LocalInspectBridge.dll"
if((Get-FileHash -LiteralPath $bridgeDll -Algorithm SHA256).Hash -ine $bridge.sha256){throw 'Prebuilt LocalInspectBridge checksum mismatch.'}
$baseline=Get-Content -Encoding UTF8 -LiteralPath "$RepoRoot\deployment-baseline.json" -Raw|ConvertFrom-Json
foreach($override in $baseline.overrides){if((Get-FileHash -LiteralPath (Join-Path $RepoRoot $override.file)).Hash -ine $override.sha256){throw 'Captured gamedata checksum mismatch.'}}
$gameBytes=(Get-ChildItem -LiteralPath $config.SourceGamePath -Recurse -File | Measure-Object -Property Length -Sum).Sum
if((Get-PSDrive -Name $base.Substring(0,1)).Free -lt $gameBytes+5GB){throw 'Insufficient target space. Need the complete game copy plus 5 GiB.'}
$originalHashes=@(Get-OriginalHashes $config.SourceGamePath)
foreach($directory in @($base,"$base\server","$base\tools","$base\data","$base\logs","$base\backups",$config.TempRoot)){
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$env:TEMP=$config.TempRoot;$env:TMP=$env:TEMP
$env:npm_config_cache=Join-Path $env:TEMP 'npm'
Write-Utf8 "$base\data\settings.json" (@{steamExe=$config.SteamExe;sourceGamePath=$config.SourceGamePath;tempRoot=$config.TempRoot;created=(Get-Date).ToString('o')}|ConvertTo-Json)
Write-Utf8 "$base\data\profile.json" (@{steamId=[string]$config.SteamId}|ConvertTo-Json)
Write-Utf8 "$base\backups\original-game-hashes.json" ($originalHashes|ConvertTo-Json)
Write-Host 'Copying the Steam game into an independent server directory. This can take several minutes.'
# No /MIR, /MOVE, symbolic links or hard links: the original client is read-only.
& robocopy.exe $config.SourceGamePath "$base\server" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /NFL /NDL /NP "/LOG:$base\logs\copy-game.log"
if($LASTEXITCODE -ge 8){throw "Game copy failed (robocopy $LASTEXITCODE). See logs\copy-game.log."}
foreach($package in (Read-PackageLock).packages | Where-Object {$_.required}){
    $target=if($package.target -eq 'game'){"$base\server\game\csgo"}else{"$base\tools"}
    Write-Host "Extracting $($package.file)"
    Expand-VerifiedArchive (Join-Path $config.PackageRoot $package.file) $target
}
foreach($override in $baseline.overrides){Copy-Item -LiteralPath (Join-Path $RepoRoot $override.file) -Destination (Join-Path $base $override.destination) -Force}
Copy-Item -Path "$RepoRoot\runtime\*" -Destination $base -Recurse -Force
Copy-Item -LiteralPath "$RepoRoot\docs\使用说明.md" -Destination "$base\使用说明.md"
New-Item -ItemType Directory -Path "$base\extensions\LocalInspectBridge" -Force | Out-Null
Copy-Item -Path "$RepoRoot\extensions\LocalInspectBridge\*" -Destination "$base\extensions\LocalInspectBridge" -Recurse -Force
$plugin="$base\server\game\csgo\addons\counterstrikesharp\plugins\LocalInspectBridge"
New-Item -ItemType Directory -Path $plugin -Force | Out-Null
Copy-Item -LiteralPath $bridgeDll -Destination "$plugin\LocalInspectBridge.dll"
$node="$base\tools\node-v24.22.3-win-x64\node.exe"
$npm="$base\tools\node-v24.22.3-win-x64\node_modules\npm\bin\npm-cli.js"
Push-Location "$base\web"
try{& $node $npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache $env:npm_config_cache;if($LASTEXITCODE -ne 0){throw 'npm ci failed. Check Internet access to registry.npmjs.org.'}}finally{Pop-Location}
& $node "$base\web\setup-database.mjs"
if($LASTEXITCODE -ne 0){throw 'Database initialization failed. Keep this directory for diagnosis; no game server was started.'}
& "$base\scripts\Configure-Server.ps1"
$after=@(Get-OriginalHashes $config.SourceGamePath)
foreach($before in $originalHashes){if(($after|Where-Object {$_.relative -eq $before.relative}).sha256 -ne $before.sha256){throw "Original game changed during installation: $($before.relative). Check whether Steam updated it."}}
& "$base\scripts\Register-PanelProtocol.ps1"
Write-Host "Installation complete: $base"
Write-Host 'Next: run Enable-Local-Isolation.cmd and approve Windows elevation; then open the HTML panel entry.'
Write-Host 'No game client/server was started. No paging-file settings were changed.'
