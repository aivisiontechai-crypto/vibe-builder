$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir 'ralph-check.mjs'

& node $nodeScript
exit $LASTEXITCODE
