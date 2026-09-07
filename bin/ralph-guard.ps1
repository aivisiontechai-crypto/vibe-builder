$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir 'ralph-guard.mjs'

& node $nodeScript
exit $LASTEXITCODE
