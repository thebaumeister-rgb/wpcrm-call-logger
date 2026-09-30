$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Cache = Join-Path $Root '.android-tools'
$Assets = Join-Path $PSScriptRoot 'app/src/main/assets/model'
$Libs = Join-Path $PSScriptRoot 'app/libs'
New-Item -ItemType Directory -Force $Cache,$Assets,$Libs | Out-Null

function Get-VerifiedFile($Url, $Path, $Hash) {
    if (!(Test-Path $Path)) { Invoke-WebRequest $Url -OutFile $Path }
    if ((Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Hash) {
        throw "Dependency checksum mismatch: $Path. Build stopped."
    }
}
Get-VerifiedFile 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar' (Join-Path $Libs 'sherpa-onnx-1.13.8.aar') '633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96'
Get-VerifiedFile 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile.tar.bz2' (Join-Path $Cache 'english-model.tar.bz2') '4dad6f4849cad551042eb875505b3fdc0fac9f1c88d709165c48b921681e61dc'
& tar -xf (Join-Path $Cache 'english-model.tar.bz2') -C $Cache
if ($LASTEXITCODE -ne 0) { throw 'Model extraction failed' }
$Model = Join-Path $Cache 'sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile'
Copy-Item (Join-Path $Model 'encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx') (Join-Path $Assets 'encoder.onnx')
Copy-Item (Join-Path $Model 'decoder-epoch-99-avg-1-chunk-16-left-128.onnx') (Join-Path $Assets 'decoder.onnx')
Copy-Item (Join-Path $Model 'joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx') (Join-Path $Assets 'joiner.onnx')
Copy-Item (Join-Path $Model 'tokens.txt') (Join-Path $Assets 'tokens.txt')
Write-Output 'Pinned speech dependencies verified and bundled.'
