param([switch]$Install, [switch]$Once, [switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'NexForge Ubuntu WSL Host Metrics'
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'NexForge\host-metrics\host.json'))
$outputDirectory = Split-Path -Parent $outputPath
$bashScript = Join-Path $PSScriptRoot 'ubuntu-wsl-host-metrics.sh'
$actionScript = Join-Path $PSScriptRoot 'ubuntu-wsl-host-actions.sh'
$actionsDirectory = [System.IO.Path]::GetFullPath((Join-Path $outputDirectory '..\host-actions'))
[System.IO.Directory]::CreateDirectory($actionsDirectory) | Out-Null
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

if ($Uninstall) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  $registrationMarker = Join-Path $actionsDirectory 'ubuntu-wsl.json'
  if (Test-Path -LiteralPath $registrationMarker) { Remove-Item -LiteralPath $registrationMarker -Force }
  Write-Output 'Coletor Ubuntu WSL do NexForge removido.'
  exit 0
}

$windowsScriptPath = $bashScript -replace '\\', '/'
$wslPathOutput = @(& wsl.exe -d Ubuntu -- wslpath -a $windowsScriptPath)
if ($LASTEXITCODE -ne 0 -or $wslPathOutput.Count -eq 0) {
  throw 'Não foi possível localizar a distro WSL chamada Ubuntu ou converter o caminho do coletor.'
}
$wslScriptPath = ($wslPathOutput -join "`n").Trim()
$wslActionPathOutput = @(& wsl.exe -d Ubuntu -- wslpath -a ($actionScript -replace '\\', '/'))
if ($LASTEXITCODE -ne 0 -or $wslActionPathOutput.Count -eq 0) {
  throw 'Não foi possível localizar o executor de atualizações do Ubuntu WSL.'
}
$wslActionScriptPath = ($wslActionPathOutput -join "`n").Trim()
$wslActionsDirectoryOutput = @(& wsl.exe -d Ubuntu -- wslpath -a ($actionsDirectory -replace '\\', '/'))
if ($LASTEXITCODE -ne 0 -or $wslActionsDirectoryOutput.Count -eq 0) {
  throw 'Não foi possível localizar a fila de ações do host no Ubuntu WSL.'
}
$wslActionsDirectory = ($wslActionsDirectoryOutput -join "`n").Trim()

function Update-HostMetrics {
  $output = @(& wsl.exe -d Ubuntu -- bash $wslScriptPath)
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "O coletor Ubuntu WSL terminou com código $exitCode."
  }
  $json = ($output -join "`n").Trim()
  $payload = $json | ConvertFrom-Json
  if (-not $payload.os -or -not $payload.generatedAt -or $payload.source -ne 'Ubuntu WSL host') {
    throw 'O coletor Ubuntu WSL retornou dados inválidos.'
  }

  $temporary = "$outputPath.tmp"
  [System.IO.File]::WriteAllText($temporary, $json, [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $outputPath -Force
}

if ($Install) {
  Update-HostMetrics
  $windowsTask = Get-ScheduledTask -TaskName 'NexForge Windows Host Metrics' -ErrorAction SilentlyContinue
  if ($windowsTask) {
    Stop-ScheduledTask -TaskName 'NexForge Windows Host Metrics' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'NexForge Windows Host Metrics' -Confirm:$false
  }

  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $scriptPath = '"' + $PSCommandPath + '"'
  $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File $scriptPath"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 2
  $startedTask = Get-ScheduledTask -TaskName $taskName
  if ($startedTask.State -ne 'Running') {
    throw 'A tarefa do Ubuntu WSL foi registrada, mas não iniciou. Confira o Histórico do Agendador de Tarefas.'
  }
  [System.IO.File]::WriteAllText((Join-Path $actionsDirectory 'ubuntu-wsl.json'), '{"platform":"Ubuntu WSL"}', [System.Text.UTF8Encoding]::new($false))
  Write-Output "Coletor Ubuntu WSL instalado para iniciar no logon do usuário $user."
  exit 0
}

while ($true) {
  try { Update-HostMetrics }
  catch { Write-Warning "Falha ao coletar métricas do Ubuntu WSL: $($_.Exception.Message)" }
  if (Test-Path -LiteralPath (Join-Path $actionsDirectory 'request.json')) {
    try {
      & wsl.exe -d Ubuntu -u root -- bash $wslActionScriptPath $wslActionsDirectory
      if ($LASTEXITCODE -ne 0) { Write-Warning "A ação solicitada no Ubuntu WSL terminou com código $LASTEXITCODE." }
    }
    catch { Write-Warning "Falha ao executar ação do host Ubuntu WSL: $($_.Exception.Message)" }
  }
  if ($Once) { break }
  Start-Sleep -Seconds 15
}
