. "$PSScriptRoot\Common.ps1"
$ErrorActionPreference='Stop'
$root='HKCU:\Software\Classes\cs2inspect'
New-Item -Path $root -Force|Out-Null
Set-Item -LiteralPath $root -Value 'URL:CS2 Local Inspect Panel'
New-ItemProperty -LiteralPath $root -Name 'URL Protocol' -Value '' -PropertyType String -Force|Out-Null
New-Item -Path "$root\shell\open\command" -Force|Out-Null
$command='"'+$env:SystemRoot+'\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$base+'\scripts\Open-Panel.ps1"'
Set-Item -LiteralPath "$root\shell\open\command" -Value $command
Write-Output 'Registered local panel entry for the current Windows user.'
