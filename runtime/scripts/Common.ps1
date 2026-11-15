$ErrorActionPreference='Stop'
$base=Split-Path -Parent $PSScriptRoot
$settings=Get-Content -Encoding UTF8 -LiteralPath "$base\data\settings.json" -Raw | ConvertFrom-Json
$env:TEMP=$settings.tempRoot
$env:TMP=$env:TEMP
$env:DOTNET_CLI_HOME="$base\data\dotnet"
$env:NUGET_PACKAGES=Join-Path $env:TEMP 'nuget'
$env:CS2INSPECT_ROOT=$base
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$node=Join-Path $base 'tools\node-v24.22.3-win-x64\node.exe'
$db=Join-Path $base 'tools\mariadb-11.4.13-winx64\bin\mariadbd.exe'
