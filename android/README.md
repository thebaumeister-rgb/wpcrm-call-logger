# WPCRM Offline Android Preview 31

The APK bundles the existing single-page form, a native AudioRecord microphone, sherpa-onnx 1.13.8, and the English streaming Zipformer2 model (2023-06-26 mobile, int8 encoder/joiner). On-device mode needs no server, account or model download at first launch. Explicit online opt-in uses Android SpeechRecognizer and may send audio through the user's speech provider. The app has ACCESS_NETWORK_STATE but no INTERNET permission; the separate provider owns its network access. Runtime assets load only from the packaged WebView asset origin; other requests are blocked. Browser online speech also requires explicit opt-in. Each fresh launch defaults to online mode, with consent before the first dictation.

## Phone installation and migration

1. In the old browser app, Export JSON to back up saved calls. Keep that app until migration is verified.
2. Download `wpcrm-offline-v31-preview.apk` from this repository's Android release on the Samsung. This is not the source ZIP or a browser update.
3. Open the APK from Downloads. If Android asks, allow installation from that specific source, then turn that permission back off afterward. Do not disable other device security. If a work-device policy blocks installation, ask IT rather than bypassing it.
4. Open **WPCRM Offline**. Allow microphone access while using the app.
5. Import saved calls from the backup; import the contact directory separately. Browser storage does not automatically transfer into an Android package.
6. Uncheck Online voice recognition, then enable airplane mode (also turn Wi-Fi off). Tap Name and speak, pause at least 10 seconds, continue, then press Stop. Check live text, saved calls after reopening, and Export JSON to local Files.
7. At the office transfer the dated JSON by USB, or share through an approved app after connectivity returns. Deleting/uninstalling this app deletes its local records; export backups first.

Keep the app visible while speaking. It holds the screen awake only during capture. App backgrounding, phone interruptions, revoked permission or an audio-device failure can stop it; there is no automatic restart/beep loop. Stop flushes remaining words before hiding the microphone panel. Speech accuracy, especially names and part numbers, requires review. No microphone audio is written to storage. Shared JSON copies remain in the app's private sharing cache for up to a day, cleaned on the next share. Android backup is disabled.

This build is Android only (Android 8+, arm64 and x86_64). iPhone packaging has not been implemented. Preview status means actual Samsung acceptance is still required, not guaranteed from simulated or emulator results.

## Build

JDK 17, Android SDK platform 35 / build tools 35.0.0, PowerShell 7 and Gradle wrapper 8.11.1 are required. Set `JAVA_HOME` and `ANDROID_HOME`, or use this workspace's ignored `.android-tools` runtime folders. Run `android/prepare.ps1`, then `android/gradlew.bat -p android assembleDebug assembleDebugAndroidTest`.

For signed delivery run `android/build-release.ps1`. The local keystore and Windows-user-encrypted password are kept under ignored `.android-tools/`. Preserve a secure backup of that signing identity to issue compatible updates. Never commit or upload those files. Installing a later APK with the same package and signing key preserves local storage; do not uninstall to update.

The preparation script verifies SHA-256 checksums before bundling dependencies. The model archive is Apache-2.0 per its original README. Its upstream source is https://huggingface.co/Zengwei/icefall-asr-librispeech-streaming-zipformer-2023-05-17 . Runtime/model notices are in APK assets/licenses. The test WAV is the earlier 20M model archive's 0.wav sample (LibriSpeech), only in the test APK, not in the user APK.

## Test boundaries

`verify.cjs` tests form behavior and the native bridge with simulated events. Android instrumentation tests decode real bundled sample audio twice with 12 seconds of silence, verify no INTERNET permission, and check that capture starts once and remains open through 12 seconds of silence. Run with `android/gradlew.bat -p android connectedDebugAndroidTest` on a test device/emulator. Do not treat an emulator as proof of Samsung microphone acoustics, names/part-number accuracy, or Android sharing destinations.
