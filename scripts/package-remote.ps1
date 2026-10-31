param(
  [string]$OutputPath = (Join-Path $env:TEMP ("nexforge-deploy-{0}.zip" -f [guid]::NewGuid().ToString('N')))
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$rootPrefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$excludedDirectories = @('.git', 'node_modules', 'dist', 'backups', 'host-metrics', 'host-actions', 'secrets', 'data', '.deploy-output')
$requiredFiles = @(
  'docker-compose.yml',
  'docker-compose.linux.yml',
  'docker-compose.vps.yml',
  'Dockerfile',
  'server/Dockerfile',
  'server/Dockerfile.docker-proxy',
  'server/config.example.json',
  'compose.env.example',
  'compose.vps.env.example'
)

if (Test-Path -LiteralPath $OutputPath) {
  throw "O arquivo de saída já existe: $OutputPath"
}

$archive = [IO.Compression.ZipFile]::Open($OutputPath, [IO.Compression.ZipArchiveMode]::Create)
$included = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
try {
  Get-ChildItem -LiteralPath $projectRoot -File -Recurse -Force | ForEach-Object {
    $fullPath = $_.FullName
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Arquivo fora da pasta do projeto: $fullPath"
    }

    $relativePath = $fullPath.Substring($rootPrefix.Length).Replace('\', '/')
    $segments = $relativePath.Split('/')
    if ($segments | Where-Object { $_ -in $excludedDirectories }) { return }
    if ($_.Name -eq 'config.json' -or $_.Name -match '^\.env($|\.(?!example$))') { return }
    if ($_.Extension -in @('.pem', '.key', '.log', '.tar', '.tgz', '.zip')) { return }

    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $fullPath,
      $relativePath,
      [IO.Compression.CompressionLevel]::Optimal
    )
    [void]$included.Add($relativePath)
  }
} finally {
  $archive.Dispose()
}

$missing = @($requiredFiles | Where-Object { -not $included.Contains($_) })
if ($missing.Count -gt 0) {
  throw "O pacote não contém arquivos necessários: $($missing -join ', ')"
}

$check = [IO.Compression.ZipFile]::OpenRead($OutputPath)
try {
  $unsafeEntries = @($check.Entries | Where-Object {
    $path = $_.FullName.Replace('\', '/')
    $parts = $path.Split('/')
    ($parts | Where-Object { $_ -in $excludedDirectories }) -or
      ($_.Name -eq 'config.json') -or
      ($_.Name -match '^\.env($|\.(?!example$))') -or
      ($_.Name -match '\.(pem|key|log|tar|tgz|zip)$')
  })
  if ($unsafeEntries.Count -gt 0) {
    throw "O pacote contém arquivos locais que não devem ser enviados: $($unsafeEntries.FullName -join ', ')"
  }
} finally {
  $check.Dispose()
}

Write-Output "Pacote criado com $($included.Count) arquivos: $OutputPath"
