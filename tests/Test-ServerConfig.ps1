param([Parameter(Mandatory=$true)][string]$FixtureRoot,[Parameter(Mandatory=$true)][string]$SourceGameInfo)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$base=(Resolve-Path -LiteralPath $FixtureRoot).Path
$settings=Get-Content -Encoding UTF8 -LiteralPath "$base\data\settings.json" -Raw|ConvertFrom-Json
$secrets=Get-Content -Encoding UTF8 -LiteralPath "$base\data\secrets.json" -Raw|ConvertFrom-Json
if($settings.sourceGamePath -ne 'unused' -or $secrets.database.port -ne 13307){throw 'Only the isolated test fixture is allowed.'}
$originalHash=(Get-FileHash -LiteralPath $SourceGameInfo).Hash
$game="$base\server\game\csgo"
foreach($directory in @("$base\scripts","$base\backups","$game\cfg","$game\addons\counterstrikesharp\configs")){New-Item -ItemType Directory -Path $directory -Force|Out-Null}
Copy-Item -LiteralPath "$repo\runtime\scripts\Common.ps1","$repo\runtime\scripts\Configure-Server.ps1" -Destination "$base\scripts"
Copy-Item -LiteralPath $SourceGameInfo -Destination "$game\gameinfo.gi"
& "$base\scripts\Configure-Server.ps1"
& "$base\scripts\Configure-Server.ps1"
$text=Get-Content -Encoding UTF8 -LiteralPath "$game\gameinfo.gi" -Raw
if([regex]::Matches($text,'Game\s+csgo/addons/metamod').Count -ne 1){throw 'Metamod insertion was not idempotent.'}
$cfg=Get-Content -Encoding UTF8 -LiteralPath "$game\cfg\inspect_server.cfg" -Raw
if($cfg -notmatch '(?m)^sv_infinite_ammo 2\s*$' -or !$cfg.Contains($secrets.rconPassword)){throw 'Generated server configuration mismatch.'}
$wp=Get-Content -Encoding UTF8 -LiteralPath "$game\addons\counterstrikesharp\configs\plugins\WeaponPaints\WeaponPaints.json" -Raw|ConvertFrom-Json
if($wp.DatabasePassword -ne $secrets.database.password){throw 'WeaponPaints database credentials mismatch.'}
if((Get-FileHash -LiteralPath $SourceGameInfo).Hash -ne $originalHash){throw 'Original gameinfo.gi changed.'}
Write-Host 'Independent gameinfo edit, idempotence, generated credentials and reload setting passed.'
