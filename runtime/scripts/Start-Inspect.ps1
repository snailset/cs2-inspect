$ErrorActionPreference='Stop'
. "$PSScriptRoot\Common.ps1"
$clients=@(Get-CimInstance Win32_Process -Filter "Name='cs2.exe'"|Where-Object {$_.ExecutablePath -ne "$base\server\game\bin\win64\cs2.exe"})
if($clients.Count){Write-Host '请先完全退出正在运行的 CS2，再启动本地检视。';Read-Host '按回车退出';exit 1}
& "$base\scripts\Start-Services.ps1" -OpenPage
$ready=$false
for($i=0;$i -lt 90;$i++){try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',27015);$c.Dispose();$ready=$true;break}catch{Start-Sleep -Seconds 1}}
if(!$ready){Write-Host "服务器未就绪，请查看 $base\logs";Read-Host '按回车退出';exit 1}
$steam=$settings.steamExe
Start-Process $steam -ArgumentList '-applaunch 730 -insecure -console +connect 127.0.0.1:27015' -WindowStyle Hidden
