param([Parameter(Mandatory=$true)][string]$ManifestPath, [switch]$Worker)
$ErrorActionPreference = 'Stop'
$stage = Split-Path -Parent $ManifestPath
$resultPath = Join-Path $stage 'result.json'
$replaced = $false
$backedUp = $false
try {
  # Start-Process gives PowerShell its own hidden console, independent of Electron's lifetime.
  if (-not $Worker) {
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -ArgumentList @(
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'),
      '-ManifestPath', ('"' + $ManifestPath + '"'), '-Worker'
    ) -ErrorAction Stop | Out-Null
    exit 0
  }
  $update = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $target = [IO.Path]::GetFullPath($update.target)
  $source = Join-Path $stage 'update.exe'
  $backup = Join-Path $stage 'previous.exe'
  if ((Split-Path -Parent $stage) -ne (Split-Path -Parent $target) -or [IO.Path]::GetExtension($target) -ne '.exe') {
    throw 'Invalid update target'
  }
  $algorithm = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($source)
  try { $checksum = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $algorithm.Dispose() }
  if ($checksum -ne $update.sha256) { throw 'Update checksum mismatch' }
  [string]$PID | Set-Content -LiteralPath (Join-Path $stage 'ready') -Encoding ASCII
  # Wait for Electron and the portable launcher to release the original executable.
  $parent = Get-Process -Id $update.processId -ErrorAction SilentlyContinue
  if ($parent -and -not $parent.WaitForExit(300000)) { throw 'Application did not close; update cancelled' }
  if (-not (Test-Path -LiteralPath (Join-Path $stage 'commit'))) { exit 0 }
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
      Move-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
      $backedUp = $true
      break
    } catch {
      if ($attempt -eq 119) { throw }
      Start-Sleep -Milliseconds 500
    }
  }
  Move-Item -LiteralPath $source -Destination $target -ErrorAction Stop
  $replaced = $true
  # Do not pass the old launcher's extracted location into the new process.
  Remove-Item Env:PORTABLE_EXECUTABLE_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:PORTABLE_EXECUTABLE_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:PORTABLE_EXECUTABLE_APP_FILENAME -ErrorAction SilentlyContinue
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target) -WindowStyle Hidden -ErrorAction Stop | Out-Null
  @{ status = 'installed'; version = $update.version } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
} catch {
  $failure = $_.Exception.Message
  if ($backedUp) {
    try {
      if ($replaced) { Remove-Item -LiteralPath $target -ErrorAction Stop }
      Move-Item -LiteralPath $backup -Destination $target -ErrorAction Stop
      Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target) -WindowStyle Hidden | Out-Null
    } catch { $failure += '; restore: ' + $_.Exception.Message }
  }
  @{ status = 'error'; message = $failure } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
  exit 1
}
