$ErrorActionPreference='Stop'
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    $process=Start-Process "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Wait -PassThru
    if($process.ExitCode -ne 0){throw 'Firewall setup did not complete. Approve elevation and retry.'}
    exit
}
. "$PSScriptRoot\Common.ps1"
if(!(Test-Path -LiteralPath "$base\backups\firewall-before-isolation.json")){Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction | ConvertTo-Json | Set-Content -LiteralPath "$base\backups\firewall-before-isolation.json" -Encoding utf8}
$exe="$base\server\game\bin\win64\cs2.exe"
if(!(Get-NetFirewallRule -Name 'CS2Inspect-Block-External-v4' -ErrorAction SilentlyContinue)){
    New-NetFirewallRule -Name 'CS2Inspect-Block-External-v4' -DisplayName 'CS2Inspect: block external IPv4' -Direction Inbound -Action Block -Program $exe -Protocol Any -RemoteAddress @('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255') -Profile Any|Out-Null
}
if(!(Get-NetFirewallRule -Name 'CS2Inspect-Block-External-v6' -ErrorAction SilentlyContinue)){
    New-NetFirewallRule -Name 'CS2Inspect-Block-External-v6' -DisplayName 'CS2Inspect: block external IPv6' -Direction Inbound -Action Block -Program $exe -Protocol Any -RemoteAddress '::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' -Profile Any|Out-Null
}
Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True
Set-NetFirewallRule -Name 'CS2Inspect-Block-External-v4' -Enabled True -Direction Inbound -Action Block -Program $exe -Protocol Any -RemoteAddress @('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255') -Profile Any
Set-NetFirewallRule -Name 'CS2Inspect-Block-External-v6' -Enabled True -Direction Inbound -Action Block -Program $exe -Protocol Any -RemoteAddress '::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' -Profile Any
$rules=@(Get-NetFirewallRule -Name 'CS2Inspect-Block-External-v4','CS2Inspect-Block-External-v6'|Select-Object Name,Enabled,Direction,Action)
$rules|ConvertTo-Json|Set-Content -LiteralPath "$base\data\isolation-enabled.json" -Encoding utf8
Write-Host 'Local-only firewall rules installed. Domain/Private/Public firewall profiles enabled.'
