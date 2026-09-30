# Version 23 review and proof

Update race fixed by comparing the published page metadata with the running APP_VERSION, not a transient installing/waiting worker reference. Cache-busted no-store checks have a 15-second timeout and persistent status. A simulated newer release tests confirmation cancellation, accepted navigation, blank startup and retained saved records, plus current/offline/server-error responses. The suite now has 19 checks. A page still running pre-fix code may require one manual refresh to receive this updater.

Guide visibility fix: summary startup no longer focuses the contact input, avoiding keyboard/scroll interference on phones. The guide receives focus and is scrolled directly into view before and after microphone startup. The phone-viewport test checks all seven guide rows, focus and viewport bounds. Actual Samsung keyboard behavior still requires device confirmation.

Current release: ordered Name/Subject/Time/Status/Purpose/Mileage/Notes streaming capture. Only Call log complete prepares review. Stop, silence and five-minute timeout do not finalize; Save is disabled while recording. New end-time/status fields survive JSON/CSV exports and edits; legacy imports derive defaults. Now minus three is verified against an anchored clock. Missing/invalid fields and reversed time ranges block saving. The 18-check suite uses mocked speech events, not real phone audio. End/status handling in the separate live WPCRM workflow remains to be verified before use.

Startup now clears every editable entry field, unselects appointment type, leaves date/time empty and no longer restores the previous draft. Sample placeholders are removed. Saved calls and contact directory are not deleted. The updated startup test verifies blank fields despite a stored draft and retained saved history.

Sharing now handles rejected Web Share promises, including permission denial, by requesting a download of the same JSON snapshot. File-only share payloads avoid unnecessary share text. Cancellation remains a no-op. A new automated test verifies intact downloaded content, unchanged saved calls, visible recovery instructions and no download on cancellation (17 checks total). Actual phone permission policy is not diagnosed by this test.

The guide narration and its no-input retry narration are disabled in summary dictation. Missing-detail prompts remain enabled. The mocked-recognition test asserts that no speech plays before the initial dictation answer.

The on-screen guide now uses Call log complete, replacing the older save-it command. Summary dictation never commits records without the Save button. Parsing remains label-based, not general-purpose AI. Real phone audio and actual WPCRM export headers remain unverified. CSV import uses Papa Parse 5.5.3 (MIT).

Multiple contacts save atomically as separate records with unique IDs and a shared meeting group ID. Blank lines and repeated names are removed. The user confirms the recipients before saving. Mileage is counted only once; later edits are per record. Tests verify draft recovery, cancellation, export structure, mileage and independent editing. There is no automatic WPCRM upload.

Reviewed 2026-09-29. Scope: static phone PWA and JSON handoff, not the legacy command-line tools or WPCRM itself.

## Findings addressed

- High: the old voice confirmation matched "save" inside "don't save". Negative answers now take priority.
- High: unreadable saved JSON silently became an empty list and could be overwritten. Writes now stop on unreadable storage, with a raw recovery download.
- High: failed storage writes and simultaneous browser windows could lose work. Save now commits only after successful storage persistence and checks for changes by another window.
- Medium: microphone startup and stopping during speech could hang. Startup is bounded; Stop settles pending operations and retains the form.
- Medium: call type recognition could loop indefinitely and spoken dates could silently fall back. Invalid types stop after two answers; uncertain dates require correction.
- Medium: dictated notes stopped at the first final recognition segment. Notes now accumulate segments with a silence window.
- Medium: deletion was immediate. Delete is confirmed and saved calls can be edited. Automatic draft restoration was removed in Version 23 at the user's request for blank startup fields.
- Medium: backups could not be restored in the app. Validated JSON import now merges by stable record ID.
- Medium: minute-only filenames could collide. JSON and CSV names now include seconds and milliseconds.
- Medium: offline navigation with a new query string could fail; cache cleanup affected unrelated caches. Navigation fallback now ignores query strings, and cleanup only targets this app's caches.
- Medium: spreadsheet exports allowed formula-like user text. CSV prefixes formula-like fields with an apostrophe.
- Low: SVG-only installation assets limited phone compatibility. Added PNG icons and installation/help page.

## Proof

See `proof/test-results.json` for the executed automated checks and browser version, and `proof/phone.png` / `proof/desktop.png` for screenshots using fictitious sample data. Reproduce with Node.js, Playwright and Edge: run `node serve.cjs`, then `node verify.cjs` in another terminal. Icon regeneration additionally requires Sharp.

## Remaining limits

- Browser speech recognition and native sharing vary by device. Real iPhone/Android microphone and share-sheet testing remains necessary; automated voice checks simulate the browser events.
- Data is browser-local, without authentication or automatic cloud backup. Export regularly. Separate browser profiles/devices have separate data.
- Native app-store packaging, background synchronization, and WPCRM automation are not part of this release.
- Import skips matching IDs rather than overwriting local records. CRM duplicate prevention remains a separate review step using exported record IDs.
- No real CRM data is included in the coworker package.

Current platform references: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [on-device recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally), [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share). Experimental on-device speech APIs are not required by this release.
