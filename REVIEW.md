# Version 28 Review And Proof

Version 27 passed simulated tests but the user reported severe sentence duplication on their phone. Version 28 merges matching multiword transcript boundaries, both within result snapshots and across automatic restarts. It also recognizes shorter replay prefixes. It does not deduplicate existing manual text or rewrite saved entries. Intentional single-word repetition in notes and repetition inside one transcript remain intact. Intentional multiword repetition across result boundaries is ambiguous and may be merged; review before saving.

The 23-check suite includes cumulative sentence expansion, repeated restart replay, interim replay prefixes, distinct new sentences, existing manual text, internal repeated words, Stop cancellation and stale callbacks. These are simulated recognition events, not physical Android microphone acceptance testing. Real phone behavior remains unverified.

Live interim speech is enabled. A replaceable text insertion preserves earlier final segments while provisional text changes; finalized result indices are processed once. Stop keeps the visible preview, and trusted keyboard input stops dictation to avoid overwriting manual edits. Structured-field previews stay in the floating panel until valid final recognition. A new test covers immediate provisional text, correction, repeated final results, multiple segments and Stop retention (19 checks total).

The UI is now a single entry form. Spoken summary, dictation guide, Dictate Details and question-by-question voice entry were removed at the user's request.

Field dictation starts on explicit field clicks only, with a persisted opt-out for normal typing. A floating Stop control is visible during startup/listening. The selected field receives final speech results; stale callbacks from a previous field cannot write to the next one. Switching aborts the prior recognizer. Stop, errors, page hiding, leaving entry controls terminate listening without saving. Startup has a ten-second limit. Silence and normal recognizer endings restart automatically until stopped.

The control is positioned above the visual viewport's keyboard area where supported. Text is inserted at the cursor or replaces selected text. Structured values are parsed for date/time, status, purpose and mileage. Unrecognized values preserve the existing value and request correction.

18 automated checks cover saved calls, editing, blank startup, import/export, duplicate contacts, storage protection, offline use, sharing denial, responsive layout, update handling, field switching, Stop, late callbacks, structured field values and microphone permission errors. Obsolete summary-mode tests were removed. Current proof images are phone.png, desktop.png and field-dictation-phone.png.

Tests use isolated sample data and mocked speech callbacks, not actual phone audio. Physical Samsung/iPhone keyboard placement, recognizer timing and native sharing remain on-device acceptance items. No live WPCRM entry was performed. Existing saved calls are preserved; customer data and credentials are excluded from packaging.
