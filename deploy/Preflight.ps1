param([string]$ConfigPath)
. "$PSScriptRoot\Common.ps1"
$config=Read-DeploymentConfig $ConfigPath
Test-PackageFiles $config.PackageRoot
$files=Get-ChildItem -LiteralPath $config.SourceGamePath -Recurse -File
$bytes=($files | Measure-Object -Property Length -Sum).Sum
$drive=Get-PSDrive -Name $config.InstallRoot.Substring(0,1)
Write-Host ('Game copy: {0:N1} GiB. Target free: {1:N1} GiB. Allow another 5 GiB.' -f ($bytes/1GB),($drive.Free/1GB))
if($drive.Free -lt $bytes+5GB){throw 'Insufficient free space for a separate server copy.'}
if(Test-Path -LiteralPath $config.InstallRoot){Write-Warning 'InstallRoot already exists. Install.ps1 only accepts an empty directory.'}
foreach($port in @(3307,17830,27015)){
    $used=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    if($used.Count){Write-Warning "TCP $port is already in use; stop the owning service before a new installation."}
}
Write-Host "Read-only checks passed. Source: $($config.SourceGamePath)"
Write-Host "Destination: $($config.InstallRoot). No game files, firewall rules or services were changed."
