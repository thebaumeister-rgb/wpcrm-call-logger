# Version 27 Review And Proof

Latest fixes: no-speech and normal onend events schedule a fresh recognizer instead of closing the field session. Stop cancels startup and restart timers and invalidates old callbacks. There is no duration cutoff. Empty restarts use bounded backoff to prevent rapid restart loops. Permission, network and startup failures remain explicit stops. Each recognition snapshot replaces the run's text; short cumulative contact-name prefixes are merged, while repeated note words remain. Two added tests cover repeated silence/restart, stopping a queued restart, late callbacks, corrected final snapshots and intentional repetition (21 checks total). Real Android service timing/beeps still require a phone trial.

Live interim speech is enabled. A replaceable text insertion preserves earlier final segments while provisional text changes; finalized result indices are processed once. Stop keeps the visible preview, and trusted keyboard input stops dictation to avoid overwriting manual edits. Structured-field previews stay in the floating panel until valid final recognition. A new test covers immediate provisional text, correction, repeated final results, multiple segments and Stop retention (19 checks total).

The UI is now a single entry form. Spoken summary, dictation guide, Dictate Details and question-by-question voice entry were removed at the user's request.

Field dictation starts on explicit field clicks only, with a persisted opt-out for normal typing. A floating Stop control is visible during startup/listening. The selected field receives final speech results; stale callbacks from a previous field cannot write to the next one. Switching aborts the prior recognizer. Stop, errors, page hiding, leaving entry controls terminate listening without saving. Startup has a ten-second limit. Silence and normal recognizer endings restart automatically until stopped.

The control is positioned above the visual viewport's keyboard area where supported. Text is inserted at the cursor or replaces selected text. Structured values are parsed for date/time, status, purpose and mileage. Unrecognized values preserve the existing value and request correction.

18 automated checks cover saved calls, editing, blank startup, import/export, duplicate contacts, storage protection, offline use, sharing denial, responsive layout, update handling, field switching, Stop, late callbacks, structured field values and microphone permission errors. Obsolete summary-mode tests were removed. Current proof images are phone.png, desktop.png and field-dictation-phone.png.

Tests use isolated sample data and mocked speech callbacks, not actual phone audio. Physical Samsung/iPhone keyboard placement, recognizer timing and native sharing remain on-device acceptance items. No live WPCRM entry was performed. Existing saved calls are preserved; customer data and credentials are excluded from packaging.
