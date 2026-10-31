param([switch]$Install, [switch]$Once, [switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'NexForge Windows Host Metrics'
$outputPath = Join-Path $env:LOCALAPPDATA 'NexForge\host-metrics\host.json'
$outputPath = [System.IO.Path]::GetFullPath($outputPath)
$outputDirectory = Split-Path -Parent $outputPath
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

if ($Install) {
  $wslTask = Get-ScheduledTask -TaskName 'NexForge Ubuntu WSL Host Metrics' -ErrorAction SilentlyContinue
  if ($wslTask) {
    Stop-ScheduledTask -TaskName 'NexForge Ubuntu WSL Host Metrics' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'NexForge Ubuntu WSL Host Metrics' -Confirm:$false
  }
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $scriptPath = '"' + $PSCommandPath + '"'
  $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File $scriptPath"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Output "Coletor do NexForge instalado para iniciar no logon do usuário $user."
  exit 0
}

if ($Uninstall) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  Write-Output 'Coletor Windows do NexForge removido.'
  exit 0
}

$driveLetter = $env:SystemDrive
$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveLetter'"
$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$processor = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
$netPrevious = @{}
$netPreviousAt = [DateTimeOffset]::UtcNow

while ($true) {
  try {
    $now = [DateTimeOffset]::UtcNow
    $os = Get-CimInstance Win32_OperatingSystem
    $computer = Get-CimInstance Win32_ComputerSystem
    $processor = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveLetter'"
    $interfaces = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
    $network = @{}
    foreach ($adapter in $interfaces) {
      $stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
      if ($stats) { $network[$adapter.Name] = @{ rx = [double]$stats.ReceivedBytes; tx = [double]$stats.SentBytes } }
    }
    $elapsed = [Math]::Max(($now - $netPreviousAt).TotalSeconds, 1)
    $rxRate = 0.0
    $txRate = 0.0
    foreach ($name in $network.Keys) {
      if ($netPrevious.ContainsKey($name)) {
        $rxRate += [Math]::Max(0, $network[$name].rx - $netPrevious[$name].rx) / $elapsed
        $txRate += [Math]::Max(0, $network[$name].tx - $netPrevious[$name].tx) / $elapsed
      }
    }
    $netPrevious = $network
    $netPreviousAt = $now

    $totalRam = [double]$os.TotalVisibleMemorySize * 1KB
    $availableRam = [double]$os.FreePhysicalMemory * 1KB
    $usedDisk = [double]$drive.Size - [double]$drive.FreeSpace
    $boot = [DateTimeOffset]$os.LastBootUpTime
    $ip = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
      Where-Object { $_.IPv4DefaultGateway } |
      ForEach-Object { $_.IPv4Address.IPAddress } |
      Select-Object -First 1
    $pendingReboot = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or
      (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or
      (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations')

    $uptime = $now - $boot
    $payload = [ordered]@{
      generatedAt = $now.ToString('o')
      name = $env:COMPUTERNAME
      ip = if ($ip) { $ip } else { '—' }
      os = "$($os.Caption) $($os.Version)"
      cpu = [Math]::Round([double]$processor.PercentProcessorTime, 1)
      ram = [Math]::Round((($totalRam - $availableRam) / $totalRam) * 100, 1)
      disk = if ($drive.Size -gt 0) { [Math]::Round(($usedDisk / [double]$drive.Size) * 100, 1) } else { 0 }
      vcpu = [int]$computer.NumberOfLogicalProcessors
      load = $null
      ramUsed = [Math]::Round(($totalRam - $availableRam) / 1GB, 1).ToString('0.0', [Globalization.CultureInfo]::InvariantCulture)
      ramTotal = [Math]::Round($totalRam / 1GB, 1).ToString('0.0', [Globalization.CultureInfo]::InvariantCulture)
      diskUsed = [Math]::Round($usedDisk / 1GB, 1).ToString('0.0', [Globalization.CultureInfo]::InvariantCulture)
      diskTotal = [Math]::Round([double]$drive.Size / 1GB, 1).ToString('0.0', [Globalization.CultureInfo]::InvariantCulture)
      uptime = '{0}d {1}h' -f [Math]::Floor($uptime.TotalDays), $uptime.Hours
      uptimeFull = '{0}d {1}h {2}m' -f [Math]::Floor($uptime.TotalDays), $uptime.Hours, $uptime.Minutes
      uptimeDays = [int][Math]::Floor($uptime.TotalDays)
      netMBs = [Math]::Round(($rxRate + $txRate) / 1MB, 2)
      pendingReboot = [bool]$pendingReboot
      bootAt = $boot.ToUnixTimeMilliseconds()
      source = 'Windows host'
    }
    $temporary = "$outputPath.tmp"
    [System.IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $outputPath -Force
  } catch {
    Write-Warning "Falha ao coletar métricas do Windows: $($_.Exception.Message)"
  }
  if ($Once) { break }
  Start-Sleep -Seconds 15
}
