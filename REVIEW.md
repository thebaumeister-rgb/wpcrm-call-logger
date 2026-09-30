# Version 19 review and proof

Sharing now handles rejected Web Share promises, including permission denial, by requesting a download of the same JSON snapshot. File-only share payloads avoid unnecessary share text. Cancellation remains a no-op. A new automated test verifies intact downloaded content, unchanged saved calls, visible recovery instructions and no download on cancellation (17 checks total). Actual phone permission policy is not diagnosed by this test.

The guide narration and its no-input retry narration are disabled in summary dictation. Missing-detail prompts remain enabled. The mocked-recognition test asserts that no speech plays before the initial dictation answer.

Version 19 adds an on-screen dictation guide, "save it" speech termination and a formatted draft review. Summary dictation never commits records without the Save call button. The 16 automated checks include mocked recognition events proving guide visibility, command removal from notes, local draft persistence and final button-only saving. Earlier checks cover contact import and missing-detail prompts. Parsing remains label-based, not general-purpose AI. Real phone audio and actual WPCRM export headers remain unverified. CSV import uses Papa Parse 5.5.3 (MIT).

Multiple contacts save atomically as separate records with unique IDs and a shared meeting group ID. Blank lines and repeated names are removed. The user confirms the recipients before saving. Mileage is counted only once; later edits are per record. Tests verify draft recovery, cancellation, export structure, mileage and independent editing. There is no automatic WPCRM upload.

Reviewed 2026-09-29. Scope: static phone PWA and JSON handoff, not the legacy command-line tools or WPCRM itself.

## Findings addressed

- High: the old voice confirmation matched "save" inside "don't save". Negative answers now take priority.
- High: unreadable saved JSON silently became an empty list and could be overwritten. Writes now stop on unreadable storage, with a raw recovery download.
- High: failed storage writes and simultaneous browser windows could lose work. Save now commits only after successful storage persistence and checks for changes by another window.
- Medium: microphone startup and stopping during speech could hang. Startup is bounded; Stop settles pending operations and retains the form.
- Medium: call type recognition could loop indefinitely and spoken dates could silently fall back. Invalid types stop after two answers; uncertain dates require correction.
- Medium: dictated notes stopped at the first final recognition segment. Notes now accumulate segments with a silence window.
- Medium: deletion was immediate and drafts disappeared on reload. Delete is confirmed; drafts restore; saved calls can be edited.
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
