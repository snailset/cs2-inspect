$ErrorActionPreference='Stop'
. "$PSScriptRoot\Common.ps1"
try {
    $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator permission required.'}
    $volume=Get-Volume -DriveLetter D
    if($volume.FileSystem -ne 'NTFS' -or $volume.SizeRemaining -lt 20GB){throw 'D drive is not ready or has insufficient free space.'}
    $previous=@(Get-CimInstance Win32_PageFileSetting|Select-Object Name,InitialSize,MaximumSize)
    $computer=Get-CimInstance Win32_ComputerSystem
    $backup="$base\backups\pagefile-before-move.json"
    if(!(Test-Path -LiteralPath $backup)){
        @{AutomaticManagedPagefile=$computer.AutomaticManagedPagefile;Settings=$previous;PagingFiles=(Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' -Name PagingFiles).PagingFiles}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $backup -Encoding UTF8
    }
    $computer|Set-CimInstance -Property @{AutomaticManagedPagefile=$false}
    $target=Get-CimInstance Win32_PageFileSetting|Where-Object {$_.Name -ieq 'D:\pagefile.sys'}
    if($target){$target|Set-CimInstance -Property @{InitialSize=[uint32]0;MaximumSize=[uint32]0}}
    else{New-CimInstance -ClassName Win32_PageFileSetting -Property @{Name='D:\pagefile.sys';InitialSize=[uint32]0;MaximumSize=[uint32]0}|Out-Null}
    $target=Get-CimInstance Win32_PageFileSetting|Where-Object {$_.Name -ieq 'D:\pagefile.sys'}
    if(!$target -or $target.InitialSize -ne 0 -or $target.MaximumSize -ne 0){throw 'D drive page file configuration verification failed.'}
    Get-CimInstance Win32_PageFileSetting|Where-Object {$_.Name -ieq 'C:\pagefile.sys'}|Remove-CimInstance
    $after=@(Get-CimInstance Win32_PageFileSetting|Select-Object Name,InitialSize,MaximumSize)
    if(@($after|Where-Object {$_.Name -ieq 'C:\pagefile.sys'}).Count){throw 'C drive page file setting is still present.'}
    @{Success=$true;RebootRequired=$true;Settings=$after;Time=(Get-Date).ToString('o')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath "$base\data\pagefile-move-result.json" -Encoding UTF8
} catch {
    @{Success=$false;Error=$_.Exception.Message;Time=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath "$base\data\pagefile-move-result.json" -Encoding UTF8
    exit 1
}
