$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$App = Get-Content -LiteralPath (Join-Path $Root 'app.js') -Raw
$Html = Get-Content -LiteralPath (Join-Path $Root 'index.html') -Raw
$AppVersion = [regex]::Match($App, 'const APP_VERSION = (\d+);').Groups[1].Value
$PageVersion = [regex]::Match($Html, 'name="app-version" content="(\d+)"').Groups[1].Value
if (!$AppVersion -or $AppVersion -ne $PageVersion) { throw 'App and page versions must match before packaging.' }
$Release = Join-Path $Root 'release'
$Stage = Join-Path $Release ('wpcrm-call-logger-v28-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
$Files = @('index.html', 'app.js', 'entry-tools.js', 'field-dictation.js', 'papaparse.min.js', 'styles.css', 'service-worker.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'START-HERE.html', 'README.md', 'FLOWCHART.md', 'REVIEW.md', 'serve.cjs', 'verify.cjs')
foreach ($File in $Files) { Copy-Item -LiteralPath (Join-Path $Root $File) -Destination $Stage }
$Proof = Join-Path $Stage 'proof'
New-Item -ItemType Directory -Path $Proof -Force | Out-Null
foreach ($File in @('phone.png','desktop.png','field-dictation-phone.png','test-results.json')) { Copy-Item -LiteralPath (Join-Path $Root ('proof/' + $File)) -Destination $Proof }
$Zip = Join-Path $Release 'wpcrm-call-logger-v28.zip'
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip -Force
Get-FileHash -LiteralPath $Zip -Algorithm SHA256
