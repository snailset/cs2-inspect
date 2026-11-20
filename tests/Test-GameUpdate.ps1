param([string]$TempRoot='D:\codex')
$ErrorActionPreference = 'Stop'
$fixture = Join-Path $TempRoot ('cs2-update-test-' + [guid]::NewGuid().ToString('N'))
$base = Join-Path $fixture 'inspect'
$server = Join-Path $base 'server'
$library = Join-Path $fixture 'Steam library\steamapps'
$source = Join-Path $library 'common\CS2'
$manifest = Join-Path $library 'appmanifest_730.acf'
$gi = 'game\csgo\gameinfo.gi'
$versionFile = 'game\csgo\steam.inf'
$map = 'game\csgo\maps\de_dust2.vpk'
$plugin = 'game\csgo\addons\metamod\plugin.dll'
$cfg = 'game\csgo\cfg\gamemode_casual_server.cfg'
$updater = Join-Path $base 'scripts\Update-Game.ps1'
$cache = Join-Path $fixture 'update temp'
$batches = Join-Path $cache 'cs2-inspect-game-updates'

function Put([string]$name, [string]$value) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($name)) | Out-Null
    [IO.File]::WriteAllText($name,$value)
}
function Assert-True([bool]$ok, [string]$message) { if (!$ok) { throw $message } }
function Expect-Failure([scriptblock]$action, [string]$expected) {
    try { & $action } catch { if ($_ -notmatch $expected) { throw }; return }
    throw "Expected failure matching $expected"
}
$acf = @'
"appid" "730"
"installdir" "CS2"
"StateFlags" "4"
"buildid" "1234"
'@
$nl = [Environment]::NewLine
$vanilla = "   Game_LowViolence csgo_lv // comment" + $nl
$legacy = $vanilla.Replace('csgo_lv', ('csgo_lv' + $nl + ([string][char]9)*3 + 'Game' + [char]9 + 'csgo/addons/metamod'))
$freshGi = $vanilla + '   Game platform' + $nl
$oldInf = "PatchVersion=1.1$nl" + "ServerVersion=11$nl"
$newInf = "PatchVersion=1.2$nl" + "ServerVersion=12$nl"
Put $updater ''
Copy-Item -LiteralPath "$PSScriptRoot\..\runtime\scripts\Update-Game.ps1" -Destination $updater -Force
Put "$base\data\settings.json" (@{sourceGamePath=$source;tempRoot=$cache} | ConvertTo-Json)
Put "$base\data\outfit-groups.json" 'fixture outfit'
Put "$base\backups\server-gameinfo-original.gi" $vanilla
Put "$server\$gi" $legacy
Put "$source\$gi" $freshGi
Put "$source\game\bin\win64\cs2.exe" 'fixture executable'
Put "$server\$map" 'old map'
Put "$source\$map" 'new fixture map'
Put "$server\$plugin" 'inspect plugin'
Put "$source\$plugin" 'client plugin'
Put "$server\$cfg" 'inspect config'
Put "$source\$cfg" 'client config'
Put "$server\$versionFile" $oldInf
Put "$source\$versionFile" $newInf
Put $manifest ($acf.Replace('"4"','"2"'))
Expect-Failure { & $updater } 'Steam'
Put $manifest $acf
& $updater -CheckOnly
Assert-True (([IO.File]::ReadAllText("$server\$gi") -ceq $legacy) -and !(Test-Path $batches)) 'Dry run wrote files'
Put "$server\$gi" ($legacy + 'custom override')
Expect-Failure { & $updater } 'gameinfo.gi'
Assert-True (!(Test-Path $batches)) 'Gameinfo conflict should fail before copying'
Put "$server\$gi" $legacy
Put "$batches\another-batch\keep.txt" 'other recovery data'
[IO.File]::SetAttributes("$server\$map", [IO.FileAttributes]::ReadOnly)
# Lock the last file so earlier changes must be rolled back after a partial update.
$lock = [IO.File]::Open("$server\$versionFile", 'Open', 'Read', 'Read')
try { Expect-Failure { & $updater } 'Delete' } finally { $lock.Dispose() }
Assert-True (([IO.File]::ReadAllText("$server\$map") -ceq 'old map') -and ([IO.File]::ReadAllText("$server\$gi") -ceq $legacy)) 'Rollback lost old files'
Assert-True ([bool]([IO.File]::GetAttributes("$server\$map") -band [IO.FileAttributes]::ReadOnly)) 'Rollback lost read-only attribute'
Assert-True (!(Test-Path "$server\game\bin\win64\cs2.exe") -and !(Test-Path "$base\backups\gameinfo-upstream.gi")) 'Rollback left new files'
Assert-True (@(Get-ChildItem -Force -LiteralPath $batches).Count -eq 1) 'Completed rollback left its batch'
& $updater
$result = [IO.File]::ReadAllText("$server\$gi")
Assert-True (($result -match 'Game platform') -and ([regex]::Matches($result,'csgo/addons/metamod').Count -eq 1)) 'Gameinfo merge failed'
Assert-True (([IO.File]::ReadAllText("$server\$map") -ceq 'new fixture map') -and ([IO.File]::ReadAllText("$server\$versionFile") -ceq $newInf)) 'Game update missing'
Assert-True (([IO.File]::ReadAllText("$server\$plugin") -ceq 'inspect plugin') -and ([IO.File]::ReadAllText("$server\$cfg") -ceq 'inspect config')) 'Overwrote local files'
Assert-True (([IO.File]::ReadAllText("$source\$gi") -ceq $freshGi) -and ([IO.File]::ReadAllText("$base\data\outfit-groups.json") -ceq 'fixture outfit')) 'Source or outfit changed'
Assert-True (@(Get-ChildItem -Force -LiteralPath $batches).Count -eq 1 -and [IO.File]::ReadAllText("$batches\another-batch\keep.txt") -ceq 'other recovery data') 'Success did not clean only the current batch'
Assert-True (!(Test-Path "$base\backups\game-updates")) 'Wrote a permanent game update backup'
& $updater
Assert-True (@(Get-ChildItem -Force -LiteralPath $batches).Count -eq 1) 'Repeat update created an unnecessary backup'

# Hold the updated map open while the final version-file replacement fails.
# Recovery must keep the original map available if it cannot put it back.
Put "$source\$map" 'another map revision'
Put "$source\$versionFile" ($newInf.Replace('1.2','1.3'))
$locks = @{ mapFile = $null }
$lock = [IO.File]::Open("$server\$versionFile", 'Open', 'Read', 'Read')
try {
    & {
        function Write-Progress($Activity,$Status,$PercentComplete,[switch]$Completed) {
            if ($Status -like '*steam.inf') { $locks.mapFile = [IO.File]::Open("$server\$map", 'Open', 'Read', 'Read') }
        }
        Expect-Failure { & $updater } 'cs2-inspect-game-updates.*de_dust2'
    }
} finally {
    $lock.Dispose()
    if ($locks.mapFile) { $locks.mapFile.Dispose() }
}
$retained = @(Get-ChildItem -LiteralPath $batches -Directory -Filter '1234-*')
Assert-True ($retained.Count -eq 1 -and [IO.File]::ReadAllText((Join-Path $retained[0].FullName "server\$map")) -ceq 'new fixture map') 'Partial rollback lost the recovery copy'
Write-Host 'PASS: verified update cleanup, rollback cleanup, recovery copy on blocked rollback, sibling preservation and idempotence.'
