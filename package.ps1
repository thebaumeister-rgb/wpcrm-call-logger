$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Release = Join-Path $Root 'release'
$Stage = Join-Path $Release ('wpcrm-call-logger-v15-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
$Files = @('index.html', 'app.js', 'styles.css', 'service-worker.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'START-HERE.html', 'README.md', 'FLOWCHART.md', 'REVIEW.md', 'serve.cjs', 'verify.cjs')
foreach ($File in $Files) { Copy-Item -LiteralPath (Join-Path $Root $File) -Destination $Stage }
Copy-Item -LiteralPath (Join-Path $Root 'proof') -Destination (Join-Path $Stage 'proof') -Recurse
$Zip = Join-Path $Release 'wpcrm-call-logger-v15.zip'
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip -Force
Get-FileHash -LiteralPath $Zip -Algorithm SHA256
