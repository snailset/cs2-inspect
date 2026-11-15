param([string]$PackageRoot,[switch]$VerifyOnly,[switch]$IncludeOptional)
. "$PSScriptRoot\Common.ps1"
if(!$PackageRoot){$PackageRoot=Join-Path $RepoRoot 'packages'}
New-Item -ItemType Directory -Path $PackageRoot -Force | Out-Null
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
foreach($package in (Read-PackageLock).packages | Where-Object {$_.required -or $IncludeOptional}){
    $file=Join-Path $PackageRoot $package.file
    if(!(Test-Path -LiteralPath $file)){
        if($VerifyOnly){throw "Missing package: $file"}
        $temporary="$file.download"
        Write-Host "Downloading $($package.file)"
        Invoke-WebRequest -Uri $package.url -OutFile $temporary -UseBasicParsing
        if((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ine $package.sha256){throw "SHA256 mismatch: $temporary. Download retained for diagnosis; not installed."}
        Move-Item -LiteralPath $temporary -Destination $file
    }
    if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $package.sha256){throw "SHA256 mismatch: $file"}
    Write-Host "Verified $($package.file)"
}
