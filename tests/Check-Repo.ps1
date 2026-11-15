param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$files=@(Get-ChildItem -LiteralPath $repo -Recurse -File|Where-Object {$_.FullName -notmatch '\\(node_modules|packages|\.git)\\'})
$errorsFound=@()
foreach($file in $files|Where-Object {$_.Extension -in @('.ps1','.psd1')}){
    $tokens=$null;$parseErrors=$null
    $null=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$parseErrors)
    $errorsFound+=@($parseErrors|ForEach-Object {"$($file.Name): $_"})
}
if($errorsFound.Count){throw ($errorsFound -join "`n")}
foreach($file in $files|Where-Object {$_.Extension -in @('.mjs','.js')}){
    & $NodePath --check $file.FullName
    if($LASTEXITCODE -ne 0){throw "JavaScript syntax failed: $($file.Name)"}
}
$info=Get-Content -Encoding UTF8 -LiteralPath "$repo\extensions\LocalInspectBridge\build-info.json" -Raw|ConvertFrom-Json
if((Get-FileHash -LiteralPath "$repo\extensions\LocalInspectBridge\prebuilt\LocalInspectBridge.dll").Hash -ine $info.sha256){throw 'Bridge binary checksum mismatch.'}
if((Get-FileHash -LiteralPath "$repo\extensions\LocalInspectBridge\LocalInspectBridge.cs").Hash -ine $info.sourceSha256){throw 'Bridge source changed since its last build.'}
$baseline=Get-Content -Encoding UTF8 -LiteralPath "$repo\deployment-baseline.json" -Raw|ConvertFrom-Json
foreach($override in $baseline.overrides){if((Get-FileHash -LiteralPath (Join-Path $repo $override.file)).Hash -ine $override.sha256){throw 'Captured gamedata checksum mismatch.'}}
. "$repo\deploy\Common.ps1"
if(!(Test-PathOverlap 'D:\Games\CS2' 'D:\Games\CS2\server')){throw 'Path guard failed.'}
if(Test-PathOverlap 'D:\Games\CS2' 'D:\Games\CS2-backup'){throw 'Path guard false positive.'}
$expected='D:\Portable Inspect\data\profile.json'
$actual=[IO.Path]::GetFullPath([IO.Path]::Combine('D:\Portable Inspect\server\game\csgo\addons\counterstrikesharp\plugins\LocalInspectBridge','../../../../../../../data/profile.json'))
if($actual -ne $expected){throw 'Bridge relative profile path mismatch.'}
& $NodePath "$repo\tests\outfit-groups.mjs"
if($LASTEXITCODE -ne 0){throw 'Outfit group checks failed.'}
Write-Host 'PowerShell/JavaScript syntax, bridge hashes and portable-path guards passed.'
