param([switch]$KeepPanel)
$ErrorActionPreference='Continue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. "$PSScriptRoot\Common.ps1"
& "$base\tools\node-v24.22.3-win-x64\node.exe" "$base\web\shutdown.mjs"
$owned=Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -in @("$base\server\game\bin\win64\cs2.exe","$base\tools\mariadb-11.4.13-winx64\bin\mariadbd.exe") -or (!$KeepPanel -and $_.ExecutablePath -eq "$base\tools\node-v24.22.3-win-x64\node.exe" -and $_.CommandLine -like '*\web\server.mjs*') }
foreach($p in $owned){Stop-Process -Id $p.ProcessId -ErrorAction SilentlyContinue}
Write-Host '本地检视服务已停止。请退出检视客户端后，再从 Steam 启动官匹。'
