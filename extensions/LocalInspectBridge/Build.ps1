param(
    [Parameter(Mandatory=$true)][string]$ServerRoot,
    [string]$OutputPath=(Join-Path $PSScriptRoot 'prebuilt\LocalInspectBridge.dll'),
    [string]$TempRoot='D:\codex\cs2inspect-cache'
)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7 -or [Environment]::Version.Major -lt 10){throw 'Compile with PowerShell 7 running on .NET 10 (or build the csproj using .NET 10 SDK).'}
$env:TEMP=$TempRoot;$env:TMP=$TempRoot
New-Item -ItemType Directory -Path $TempRoot,(Split-Path -Parent $OutputPath) -Force|Out-Null
if(Test-Path -LiteralPath $OutputPath){throw 'OutputPath already exists. Choose a new output file, review it, then replace prebuilt explicitly.'}
$api=Join-Path $ServerRoot 'game\csgo\addons\counterstrikesharp\api'
$references=@(Get-ChildItem -LiteralPath "$PSHOME\ref" -Filter '*.dll';Get-ChildItem -LiteralPath $api -Filter '*.dll')|Group-Object Name|ForEach-Object {$_.Group[0].FullName}
Add-Type -Path "$PSScriptRoot\LocalInspectBridge.cs" -ReferencedAssemblies $references -OutputAssembly $OutputPath -CompilerOptions '/nullable:enable','/optimize+'
Write-Output $OutputPath
