$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir 'ralph-setup.mjs'

$arguments = @()
if ($args.Count -gt 0) {
  $arguments = $args
}

& node $nodeScript @arguments
exit $LASTEXITCODE
