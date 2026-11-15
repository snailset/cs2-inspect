param([switch]$OpenPage)
$ErrorActionPreference='Stop'
. "$PSScriptRoot\Common.ps1"
if(!(Test-Path "$base\data\isolation-enabled.json") -or @(Get-NetFirewallProfile -Name Domain,Private,Public|Where-Object {!$_.Enabled}).Count){throw 'Local isolation is not enabled. Run Enable-Local-Isolation.cmd as administrator first.'}
$policy=New-Object -ComObject HNetCfg.FwPolicy2
foreach($family in @('IPv4','IPv6')){
    try{$rule=$policy.Rules.Item("CS2Inspect: block external $family")}catch{throw 'Local firewall rule is missing. Run Enable-Local-Isolation.cmd as administrator.'}
    $expectedAddress=if($family -eq 'IPv4'){'0.0.0.0-126.255.255.255,128.0.0.0-255.255.255.255'}else{'::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'}
    if(!$rule.Enabled -or $rule.Direction -ne 1 -or $rule.Action -ne 0 -or $rule.ApplicationName -ine "$base\server\game\bin\win64\cs2.exe" -or $rule.Profiles -ne 2147483647 -or $rule.Protocol -ne 256 -or $rule.RemoteAddresses -ine $expectedAddress){throw 'Local firewall rule verification failed. Run Enable-Local-Isolation.cmd as administrator.'}
}



function Has-Process($exe,$argument){@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $exe -and (!$argument -or $_.CommandLine -like "*$argument*")}).Count -gt 0}
function Wait-LocalPort($port,$seconds){for($i=0;$i -lt $seconds;$i++){try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',$port);$c.Dispose();return}catch{Start-Sleep -Seconds 1}};throw "Local service on port $port did not become ready. Check $base\logs."}
$db="$base\tools\mariadb-11.4.13-winx64\bin\mariadbd.exe"
if(!(Has-Process $db 'mariadb.ini')){Start-Process $db -ArgumentList "--defaults-file=`"$base\data\mariadb.ini`"" -WorkingDirectory "$base\tools\mariadb-11.4.13-winx64" -WindowStyle Hidden -RedirectStandardOutput "$base\logs\database-stdout.log" -RedirectStandardError "$base\logs\database-stderr.log"|Out-Null}
Wait-LocalPort 3307 30
$exe="$base\server\game\bin\win64\cs2.exe"
if(!(Has-Process $exe '-dedicated')){Start-Process $exe -ArgumentList '-dedicated -insecure -console -condebug -conclearlog -usercon -ip 127.0.0.1 -port 27015 -maxplayers 2 +sv_lan 1 +game_type 0 +game_mode 0 +map de_dust2 +exec inspect_server.cfg' -WorkingDirectory "$base\server\game" -WindowStyle Hidden|Out-Null}
$node="$base\tools\node-v24.22.3-win-x64\node.exe"
if(!(Has-Process $node "$base\web\server.mjs")){Start-Process $node -ArgumentList "`"$base\web\server.mjs`"" -WorkingDirectory "$base\web" -WindowStyle Hidden -RedirectStandardOutput "$base\logs\web.log" -RedirectStandardError "$base\logs\web-error.log"|Out-Null}
Wait-LocalPort 17830 15
if($OpenPage){Start-Process 'http://127.0.0.1:17830'}
Write-Output 'Local services started. Panel: http://127.0.0.1:17830'
