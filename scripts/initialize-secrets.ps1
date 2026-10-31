param(
  [string]$SecretsPath = "$env:LOCALAPPDATA\NexForge\secrets"
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $SecretsPath | Out-Null
$currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value

function New-RandomBytes([int]$Count) {
  $provider = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $buffer = [byte[]]::new($Count)
    $provider.GetBytes($buffer)
    return ,$buffer
  } finally { $provider.Dispose() }
}

function New-HexSecret([int]$Bytes) {
  $buffer = New-RandomBytes $Bytes
  return [BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant()
}

$initial = @{
  nexforge_db_password = { New-HexSecret 32 }
  panel_password = { [Convert]::ToBase64String((New-RandomBytes 32)).TrimEnd('=').Replace('+','-').Replace('/','_') }
  panel_secret = { New-HexSecret 48 }
  restic_password = { New-HexSecret 48 }
  aws_credentials = { "[default]`n" }
}

foreach ($name in $initial.Keys) {
  $target = Join-Path $SecretsPath $name
  if (-not (Test-Path -LiteralPath $target)) {
    $value = & $initial[$name]
    [IO.File]::WriteAllText($target, $value + "`n", [Text.UTF8Encoding]::new($false))
  }
  & icacls $target /inheritance:r /grant:r "*$currentUserSid`:(F)" '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível restringir a ACL de $name" }
}

Write-Output "NexForge secret files are available at $SecretsPath (values not displayed)."
