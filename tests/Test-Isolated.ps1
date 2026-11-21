param(
    [Parameter(Mandatory=$true)][string]$NodePath,
    [string]$PackageRoot,
    [string]$PreviewCacheRoot,
    [string]$TempRoot='D:\codex'
)
. "$PSScriptRoot\..\deploy\Common.ps1"
if(!$PackageRoot){$PackageRoot=Join-Path $RepoRoot 'packages'}
foreach($port in @(13307,17831)){if(@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count){throw "Test port $port is occupied."}}
Test-PackageFiles $PackageRoot
$testRoot=Join-Path $TempRoot ('cs2-inspect-test-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))
$base=Join-Path $testRoot 'portable install'
foreach($dir in @($base,"$base\data","$base\logs","$base\tools","$base\temp")){New-Item -ItemType Directory -Path $dir -Force|Out-Null}
Copy-Item -LiteralPath "$RepoRoot\runtime\web" -Destination $base -Recurse
Copy-Item -LiteralPath "$RepoRoot\docs\使用说明.md" -Destination "$base\使用说明.md"
Write-Utf8 "$base\data\settings.json" (@{tempRoot="$base\temp";steamExe='unused';sourceGamePath='unused'}|ConvertTo-Json)
Write-Utf8 "$base\data\profile.json" (@{steamId='76561198000000000'}|ConvertTo-Json)
# Changes apply only to the isolated fixture, never to tracked source or a deployed service.
$setup=Get-Content -Encoding UTF8 -LiteralPath "$base\web\setup-database.mjs" -Raw
Write-Utf8 "$base\web\setup-database.mjs" ($setup.Replace('3307','13307'))
$server=Get-Content -Encoding UTF8 -LiteralPath "$base\web\server.mjs" -Raw
Write-Utf8 "$base\web\server.mjs" ($server.Replace('17830','17831').Replace('3307','13307'))
# Never connect to the real game, even when the test applies a complete outfit.
Copy-Item -LiteralPath "$RepoRoot\tests\rcon-fixture.mjs" -Destination "$base\web\rcon.mjs" -Force
Expand-VerifiedArchive (Join-Path $PackageRoot 'mariadb-11.4.13-winx64.zip') "$base\tools"
Expand-VerifiedArchive (Join-Path $PackageRoot 'WeaponPaints.zip') "$base\server\game\csgo"
$fixtureMaps="$base\server\game\csgo\maps"
New-Item -ItemType Directory -Path $fixtureMaps -Force | Out-Null
foreach($icon in Get-ChildItem -LiteralPath "$base\web\map-icons" -Filter '*.png'){
    Write-Utf8 (Join-Path $fixtureMaps ($icon.BaseName+'.vpk')) 'fixture only; not a playable map'
}
if($PreviewCacheRoot){
    New-Item -ItemType Directory -Path "$base\data\preview-images" -Force | Out-Null
    foreach($image in @('7-44.png','515-38.png','5030-10037.png','4613-0.png')){
        Copy-Item -LiteralPath (Join-Path $PreviewCacheRoot $image) -Destination "$base\data\preview-images\$image"
    }
}
$env:TEMP="$base\temp";$env:TMP=$env:TEMP
$npm=Join-Path (Split-Path -Parent $NodePath) 'node_modules\npm\bin\npm-cli.js'
Push-Location "$base\web"
try{& $NodePath $npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$testRoot\npm-cache";if($LASTEXITCODE -ne 0){throw 'Fixture npm ci failed.'}}finally{Pop-Location}
& $NodePath "$base\web\setup-database.mjs"
if($LASTEXITCODE -ne 0){throw 'Fresh fixture database setup failed.'}
$sourceGameInfo=Join-Path $testRoot 'source-gameinfo.gi'
Write-Utf8 $sourceGameInfo "GameInfo { FileSystem { SearchPaths { Game_LowViolence csgo_lv } } }"
& "$PSScriptRoot\Test-ServerConfig.ps1" -FixtureRoot $base -SourceGameInfo $sourceGameInfo
$dbProcess=$null;$webProcess=$null
try{
    $dbProcess=Start-Process "$base\tools\mariadb-11.4.13-winx64\bin\mariadbd.exe" -ArgumentList "--defaults-file=`"$base\data\mariadb.ini`"" -WindowStyle Hidden -PassThru
    $webProcess=Start-Process $NodePath -ArgumentList "`"$base\web\server.mjs`"" -WindowStyle Hidden -RedirectStandardOutput "$base\logs\web.log" -RedirectStandardError "$base\logs\web-error.log" -PassThru
    $ready=$false
    for($i=0;$i -lt 30;$i++){
        if($webProcess.HasExited){throw 'Fixture web process exited. See logs/web-error.log.'}
        if($dbProcess.HasExited){throw 'Fixture database process exited. See logs/mariadb-error.log.'}
        try{$response=Invoke-RestMethod 'http://127.0.0.1:17831/api/state' -TimeoutSec 3;if($response.database){$ready=$true;break}}catch{}
        Start-Sleep -Milliseconds 300
    }
    if(!$ready){throw 'Fixture web server or database did not become ready.'}
    Copy-Item -LiteralPath "$RepoRoot\tests\isolated-checks.mjs" -Destination "$base\web\isolated-checks.mjs"
    & $NodePath "$base\web\isolated-checks.mjs"
    if($LASTEXITCODE -ne 0){throw 'Fixture integration checks failed.'}
}finally{
    foreach($process in @($webProcess,$dbProcess)){if($process -and !$process.HasExited){Stop-Process -Id $process.Id -ErrorAction SilentlyContinue}}
}
Write-Host "Isolated integration passed. Fixture retained at: $testRoot"
