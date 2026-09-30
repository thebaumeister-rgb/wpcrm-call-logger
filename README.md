# WPCRM Call Logger - Version 27

Pauses no longer end the field session: normal recognizer endings and no-speech events resume automatically while the app is visible. The Stop button remains available, and there is no five-minute app cutoff. Stop cancels pending restarts. Saving, switching fields, disabling dictation, typing, leaving the app, permission errors and other fatal microphone errors still end or switch listening. Android may beep when its speech service restarts. Recognition snapshots replace earlier text instead of repeatedly appending first words; cumulative contact-name expansions are merged while intentional repetition in notes is preserved. The suite now has 21 checks.

Text fields now show provisional words as the recognizer supplies them and replace those words with corrections, rather than appending duplicates. Stop keeps the currently visible text for review. For dates, mileage and choices, provisional speech appears in the microphone panel and the field is updated after recognition finalizes a valid value. Recognition speed depends on the phone/browser and connection. The suite now includes 19 checks.

Record appointment details on your phone and export them for a separate supervised WPCRM entry workflow. There is no automatic CRM or OneDrive connection.

## Install

Open https://thebaumeister-rgb.github.io/wpcrm-call-logger/ in Chrome on Android or Safari on iPhone. Use the browser menu to install or add to the home screen. No GitHub account is needed.

Check for updates compares the published version with the running version and asks before reloading. Saved calls and contacts remain; unfinished fields are cleared only after approval. Do not clear browser data to update.

## Enter A Call

The screen is a single list: Name, Add name, Subject, Time - Start, Time - End, Status, Purpose, Mileage, Notes, and optional Actions.

Dictate on field tap is enabled by default:
1. Tap a field. Allow microphone access if asked.
2. Say its value, without saying the field label.
3. A floating Stop button appears while the microphone starts or listens.
4. Tap Stop to stop listening, or tap another field to move dictation there.
5. Review the fields, make corrections, and press Save.

The spoken-summary box, guide, Dictate Details and Start voice buttons have been removed. No spoken completion command is needed. Stop never saves or clears the call. Scrolling alone does not start or stop the microphone. Silence resumes automatically; permission/network errors and app hiding stop it, requiring a field tap to retry.

Turn Dictate on field tap off for normal typing or keyboard dictation. The preference is stored locally. Text is inserted at the cursor or replaces selected text; select existing words to replace them. Wait for recognized words to appear before tapping Stop.

For Start time, say Now to set start and end to now, or Now minus three for start three hours ago and end now. A full explicit range can also be spoken: start September 29 2026 at 9:00 AM end September 29 2026 at 10:30 AM. End time can be edited separately. Unrecognized values leave existing field contents intact. Check dates before saving.

Status accepts Open or Completed. Purpose accepts Call or Meeting. Mileage accepts numbers including zero. Add name accepts comma-separated names or one per line; the spoken word comma is also supported. Each unique contact receives a separate saved record with the shared details. Mileage is counted once per shared meeting. Later edits affect one saved record at a time.

## Contacts And Backup

Import contacts accepts CSV (Contact Name, Company, Contact ID, or First Name and Last Name), TXT (one name per line), or JSON lists. Company and ID are optional. Excel files must be exported to CSV. Identical names require company/ID selection; unmatched names require confirmation. Keep the original directory export; it is not part of the saved-call backup.

Share JSON opens supported native sharing. If denied, the app requests a download and shows instructions. On Samsung, use My Files > Downloads to share the dated JSON. Export JSON is also available directly. Canceling sharing does not download anything. Verify the file reached your chosen destination.

Import saved calls validates JSON and merges new record IDs, retaining local versions of existing IDs. Saved calls and contacts stay in this browser on this device; clearing browser data can delete them. Blank entry fields on launch do not delete saved history.

## WPCRM Handoff

Provide the exported JSON in your dedicated upload chat and sign into WPCRM yourself. Confirm which records to process. Match contacts exactly and stop when unclear. Use Add New > Appointment and enter each record's details, including status and both times. Verify each save and track record IDs to avoid duplicate entry.

appointment_datetime is the start; appointment_end_datetime is the end. status is Open or Completed; completed is No or Yes respectively. Never force Open records to Completed. Legacy imports without end/status use start as end and derive status from the completed flag.

## Verification And Development

The release package contains the app, coworker guide, workflow, review notes, phone/desktop proof and 18 automated checks. Speech tests use simulated recognition; actual Samsung/iPhone microphones, keyboards, sound cues and native sharing require on-device testing. Speech may use an online browser-provider service. No customer records were used in tests.

With Node installed, run node serve.cjs 8081 and open http://127.0.0.1:8081. With Playwright and Edge available, run node verify.cjs. Run package.ps1 after successful tests. Packaging excludes customer data and repository history. Release updates must keep APP_VERSION, app-version metadata, asset versions and cache version aligned.
