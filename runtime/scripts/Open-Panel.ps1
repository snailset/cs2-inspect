param([switch]$NoOpen)
$ErrorActionPreference='Stop'
. "$PSScriptRoot\Common.ps1"

$mutex=New-Object Threading.Mutex($false,'Local\CS2InspectPanelStartup')
$acquired=$false
try{
    $acquired=$mutex.WaitOne(10000)
    if(!$acquired){throw '控制台启动繁忙，请稍后再试。'}
    $node="$base\tools\node-v24.22.3-win-x64\node.exe"
    $running=@(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -eq $node -and $_.CommandLine -like '*\web\server.mjs*'})
    if(!$running.Count){Start-Process $node -ArgumentList "`"$base\web\server.mjs`"" -WorkingDirectory "$base\web" -WindowStyle Hidden -RedirectStandardOutput "$base\logs\web.log" -RedirectStandardError "$base\logs\web-error.log"|Out-Null}
    $ready=$false
    for($i=0;$i -lt 20;$i++){try{$r=Invoke-WebRequest 'http://127.0.0.1:17830/' -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Milliseconds 300}
    if(!$ready){throw "本地控制台没有启动，请查看 $base\logs\web-error.log。"}
    if(!$NoOpen){Start-Process 'http://127.0.0.1:17830/'}
}finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
