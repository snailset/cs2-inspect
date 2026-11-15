param([Parameter(Mandatory=$true)][string]$InstallRoot,[switch]$Online)
$ErrorActionPreference='Stop'
$base=(Resolve-Path -LiteralPath $InstallRoot).Path
$settings=Get-Content -Encoding UTF8 -LiteralPath "$base\data\settings.json" -Raw|ConvertFrom-Json
$expected=@('web\server.mjs','web\node_modules\mysql2\package.json','data\secrets.json','data\profile.json','data\mariadb\mysql','server\game\bin\win64\cs2.exe','server\game\csgo\addons\counterstrikesharp\plugins\LocalInspectBridge\LocalInspectBridge.dll','server\game\csgo\addons\counterstrikesharp\plugins\WeaponPaints\WeaponPaints.dll')
foreach($relative in $expected){if(!(Test-Path -LiteralPath (Join-Path $base $relative))){throw "Missing installed file: $relative"}}
$before=Get-Content -Encoding UTF8 -LiteralPath "$base\backups\original-game-hashes.json" -Raw|ConvertFrom-Json
foreach($file in $before){if((Get-FileHash -LiteralPath (Join-Path $settings.sourceGamePath $file.relative)).Hash -ine $file.sha256){throw "Original game differs from installation baseline: $($file.relative). A Steam update also causes this."}}
$cfg=Get-Content -Encoding UTF8 -LiteralPath "$base\server\game\csgo\cfg\inspect_server.cfg" -Raw
if($cfg -notmatch '(?m)^sv_infinite_ammo 2\s*$' -or $cfg -notmatch '(?m)^sv_lan 1\s*$'){throw 'Reload/LAN configuration mismatch.'}
$policy=New-Object -ComObject HNetCfg.FwPolicy2
foreach($family in @('IPv4','IPv6')){
    $rule=$policy.Rules.Item("CS2Inspect: block external $family")
    $address=if($family -eq 'IPv4'){'0.0.0.0-126.255.255.255,128.0.0.0-255.255.255.255'}else{'::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'}
    if(!$rule.Enabled -or $rule.Direction -ne 1 -or $rule.Action -ne 0 -or $rule.ApplicationName -ine "$base\server\game\bin\win64\cs2.exe" -or $rule.Profiles -ne 2147483647 -or $rule.Protocol -ne 256 -or $rule.RemoteAddresses -ine $address){throw "Firewall rule mismatch: $family"}
}
if(@(Get-NetFirewallProfile|Where-Object {!$_.Enabled}).Count){throw 'A Windows firewall profile is disabled.'}
Write-Host 'Files, original client hashes, reload configuration and firewall rules passed.'
if($Online){
    & "$base\tools\node-v24.22.3-win-x64\node.exe" "$base\web\verify-deployment.mjs"
    if($LASTEXITCODE -ne 0){throw 'Online checks failed.'}
}
