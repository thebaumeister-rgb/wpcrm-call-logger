# Version 30 Offline Android Preview: Review And Proof

Version 30 adds field-aware formatting only to new all-capital offline speech. Names use title case (or an exact imported spelling), prose uses sentence case, selected names in notes keep their spelling, and letter-number part identifiers/common technical acronyms remain uppercase. Formatting rebuilds only the dictated insertion and does not alter manual text or saved records. A new integration test exercises uppercase interim/final events, imported names, apostrophes, identifiers, acronyms and mid-sentence insertion. The browser/bridge suite now contains 26 checks. Version 29's Android microphone tests below are historical evidence for the unchanged capture engine, not a new physical-phone acceptance claim.

## Current implementation

Android APK with bundled sherpa-onnx and English speech model. Raw PCM is processed on-device and discarded, not uploaded or saved. Native AudioRecord remains open at phrase endpoints. The decoder can reset after silence without closing/restarting capture. No Android INTERNET permission; remote WebView requests are denied. Browser cloud recognition is disabled. Shared app forms, storage keys and JSON schemas remain compatible with earlier exports.

Stop flushes the model's last words before hiding the microphone panel. Field switching, typing, Save, app backgrounding and microphone errors stop or switch recording. The native bridge uses stable result indices and ignores stale session IDs; it does not use the legacy deduplication heuristic. System file import/export and Android file sharing replace browser download/share APIs inside the APK. Files stay local unless the user selects an external sharing destination.

## Verified locally

- Signed Android release APK builds and its signature verifies.
- 25 browser/form/bridge checks pass, including native final-word flush, deliberate repeated phrases, no cloud fallback, native exports, saved calls and contacts, update behavior, and migration-compatible JSON.
- Four Android 15 emulator instrumentation checks pass with airplane mode on: no INTERNET permission; one microphone start and no end through 12 seconds of silence; real bundled speech decoding before and after 12 seconds of silence; installed WebView form saving, local history after reopening, blank new fields and JSON export generation.
- The initial small 20M model dropped opening words in the known sample. It was replaced before release by the larger Zipformer2 2023-06-26 mobile model, which decoded the full reference sentence correctly both times, including first words. The test now checks the full repeated reference text. This is one public sample, not a general accuracy guarantee; names, part numbers, dates and mileage require review.

## Release limits

This is a preview, not a physical Samsung acceptance claim. Real microphone acoustics, first-word pickup, battery use, Bluetooth/phone interruptions, keyboard positioning, long sessions and the system Files/share destinations must be tested on the S25 Ultra and tablet. No iPhone package has been built. Android and browser storage are separate; export/import existing calls and import the contact directory separately. Do not uninstall either app before backing up records. Signing keys, passwords, SDK caches and customer data are excluded from source and release assets.

## Historical browser fixes (versions 25-28, superseded for native speech)

Version 27 passed simulated tests but the user reported severe sentence duplication on their phone. Version 28 merges matching multiword transcript boundaries, both within result snapshots and across automatic restarts. It also recognizes shorter replay prefixes. It does not deduplicate existing manual text or rewrite saved entries. Intentional single-word repetition in notes and repetition inside one transcript remain intact. Intentional multiword repetition across result boundaries is ambiguous and may be merged; review before saving.

The 23-check suite includes cumulative sentence expansion, repeated restart replay, interim replay prefixes, distinct new sentences, existing manual text, internal repeated words, Stop cancellation and stale callbacks. These are simulated recognition events, not physical Android microphone acceptance testing. Real phone behavior remains unverified.

Live interim speech is enabled. A replaceable text insertion preserves earlier final segments while provisional text changes; finalized result indices are processed once. Stop keeps the visible preview, and trusted keyboard input stops dictation to avoid overwriting manual edits. Structured-field previews stay in the floating panel until valid final recognition. A new test covers immediate provisional text, correction, repeated final results, multiple segments and Stop retention (19 checks total).

The UI is now a single entry form. Spoken summary, dictation guide, Dictate Details and question-by-question voice entry were removed at the user's request.

Field dictation starts on explicit field clicks only, with a persisted opt-out for normal typing. A floating Stop control is visible during startup/listening. The selected field receives final speech results; stale callbacks from a previous field cannot write to the next one. Switching aborts the prior recognizer. Stop, errors, page hiding, leaving entry controls terminate listening without saving. Startup has a ten-second limit. Silence and normal recognizer endings restart automatically until stopped.

The control is positioned above the visual viewport's keyboard area where supported. Text is inserted at the cursor or replaces selected text. Structured values are parsed for date/time, status, purpose and mileage. Unrecognized values preserve the existing value and request correction.

18 automated checks cover saved calls, editing, blank startup, import/export, duplicate contacts, storage protection, offline use, sharing denial, responsive layout, update handling, field switching, Stop, late callbacks, structured field values and microphone permission errors. Obsolete summary-mode tests were removed. Current proof images are phone.png, desktop.png and field-dictation-phone.png.

Tests use isolated sample data and mocked speech callbacks, not actual phone audio. Physical Samsung/iPhone keyboard placement, recognizer timing and native sharing remain on-device acceptance items. No live WPCRM entry was performed. Existing saved calls are preserved; customer data and credentials are excluded from packaging.
