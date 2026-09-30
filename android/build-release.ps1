$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Tools = Join-Path $Root '.android-tools'
if (!$env:JAVA_HOME) { $env:JAVA_HOME = (Get-ChildItem (Join-Path $Tools 'jdk') -Directory | Select-Object -First 1).FullName }
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $Tools 'sdk' }
& (Join-Path $PSScriptRoot 'prepare.ps1')

# Keep the signing identity on this computer. Never include it in source or release assets.
if (!$env:WPCRM_KEYSTORE) { $env:WPCRM_KEYSTORE = Join-Path $Tools 'wpcrm-offline.jks' }
$Secret = Join-Path $Tools 'signing-password.xml'
if (!$env:WPCRM_SIGNING_PASSWORD) {
    if (!(Test-Path $Secret)) {
        if (Test-Path $env:WPCRM_KEYSTORE) { throw 'Existing signing key found without its password. Do not replace it.' }
        $bytes = New-Object byte[] 32
        [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
        $secure = ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
        $secure | Export-Clixml $Secret
    }
    $secure = Import-Clixml $Secret
    $env:WPCRM_SIGNING_PASSWORD = [Net.NetworkCredential]::new('', $secure).Password
}
try {
    if (!(Test-Path $env:WPCRM_KEYSTORE)) {
        & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $env:WPCRM_KEYSTORE -alias wpcrm-offline -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=WPCRM Offline' -storepass:env WPCRM_SIGNING_PASSWORD -keypass:env WPCRM_SIGNING_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Signing key creation failed' }
    }
    & (Join-Path $PSScriptRoot 'gradlew.bat') -p $PSScriptRoot assembleRelease --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
    $Release = Join-Path $Root 'release'
    New-Item -ItemType Directory -Force $Release | Out-Null
    $Apk = Join-Path $Release 'wpcrm-offline-v29-preview.apk'
    Copy-Item (Join-Path $PSScriptRoot 'app/build/outputs/apk/release/app-release.apk') $Apk
    & (Join-Path $env:ANDROID_HOME 'build-tools/35.0.0/apksigner.bat') verify --verbose $Apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
    Get-FileHash $Apk -Algorithm SHA256
} finally { Remove-Item Env:WPCRM_SIGNING_PASSWORD -ErrorAction SilentlyContinue }
