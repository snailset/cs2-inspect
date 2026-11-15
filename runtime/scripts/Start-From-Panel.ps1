param([switch]$ServicesOnly,[ValidateSet('de_dust2','de_mirage','de_inferno','de_nuke','de_overpass','de_ancient','de_anubis','de_train','de_vertigo','de_cache')][string]$Map='de_dust2')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. "$PSScriptRoot\Common.ps1"
$clients=@(Get-CimInstance Win32_Process -Filter "Name='cs2.exe'"|Where-Object {$_.ExecutablePath -ne "$base\server\game\bin\win64\cs2.exe"})
if(!$ServicesOnly -and @($clients|Where-Object {$_.CommandLine -notmatch '(^|\s)-insecure(\s|$)'}).Count){throw '请先退出当前普通模式的 CS2，再启动本地检视。'}
& "$base\scripts\Start-Services.ps1" -Map $Map
& "$base\tools\node-v24.22.3-win-x64\node.exe" "$base\web\wait-server.mjs"
if($LASTEXITCODE -ne 0){throw "服务器未完成地图加载，请查看 $base\logs。"}
if(!$ServicesOnly){
    if(!$clients.Count){Start-Process $settings.steamExe -ArgumentList '-applaunch 730 -insecure -console +connect 127.0.0.1:27015' -WindowStyle Hidden}
    else {Write-Output '检视客户端已经运行。如尚未连接，请使用页面上的连接指令。'}
}
