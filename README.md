# WPCRM Call Logger - Version 29 Offline Android Preview

The Android APK bundles its English speech model and processes microphone audio entirely on the device. It has no INTERNET permission, no account, no cloud speech fallback, and no model download at first launch. Native AudioRecord stays open through pauses; only the speech decoder segments phrases. Stop flushes the last words for review. The native path preserves repeated phrases rather than applying the old replay-removal heuristic.

Keep the app visible while recording. Stop, switching fields, saving, typing, backgrounding or a microphone interruption end or switch capture. There is no silence-driven microphone restart loop. Real Samsung acoustic accuracy and long-pause behavior require a phone acceptance test; preview status is deliberate.

Text fields show live provisional speech and replace it with corrected results. Structured fields update on finalized valid values. Processing speed and accuracy depend on the device and model, not connectivity. Names and part numbers need review.

Record appointment details on your phone and export them for a separate supervised WPCRM entry workflow. There is no automatic CRM or OneDrive connection.

## Install

Install the signed Android APK from https://github.com/thebaumeister-rgb/wpcrm-call-logger/releases . See [Android installation, migration and build instructions](android/README.md). Back up existing browser calls using Export JSON, then Import saved calls in WPCRM Offline. Import your contact directory separately. Do not delete the old app until migration is verified.

The browser edition remains available for typing, imports and exports. Browser voice entry is disabled to prevent cloud processing; it is not the offline speech app. The APK is Android only, not an iPhone installer. Android Check for updates opens GitHub externally, requiring a connection; install a newer APK over the existing app without uninstalling. The browser update button still compares page versions before reloading.

## Enter A Call

The screen is a single list: Name, Add name, Subject, Time - Start, Time - End, Status, Purpose, Mileage, Notes, and optional Actions.

Dictate on field tap is enabled by default:
1. Tap a field. Allow microphone access if asked.
2. Say its value, without saying the field label.
3. A floating Stop button appears while the microphone starts or listens.
4. Tap Stop to stop listening, or tap another field to move dictation there.
5. Review the fields, make corrections, and press Save.

The spoken-summary box, guide, Dictate Details and Start voice buttons remain removed. No spoken completion command is needed. Stop never saves or clears the call. Scrolling and silence do not stop native capture. App hiding or a microphone error stops capture; tap a field to resume.

Turn Dictate on field tap off for typing. Third-party keyboard dictation has its own privacy/connectivity requirements and is not part of this app's offline guarantee. Text is inserted at the cursor or replaces selected text. After pressing Stop, wait for final words before saving.

For Start time, say Now to set start and end to now, or Now minus three for start three hours ago and end now. A full explicit range can also be spoken: start September 29 2026 at 9:00 AM end September 29 2026 at 10:30 AM. End time can be edited separately. Unrecognized values leave existing field contents intact. Check dates before saving.

Status accepts Open or Completed. Purpose accepts Call or Meeting. Mileage accepts numbers including zero. Add name accepts comma-separated names or one per line; the spoken word comma is also supported. Each unique contact receives a separate saved record with the shared details. Mileage is counted once per shared meeting. Later edits affect one saved record at a time.

## Contacts And Backup

Import contacts accepts CSV (Contact Name, Company, Contact ID, or First Name and Last Name), TXT (one name per line), or JSON lists. Company and ID are optional. Excel files must be exported to CSV. Identical names require company/ID selection; unmatched names require confirmation. Keep the original directory export; it is not part of the saved-call backup.

In Android, Export JSON opens the system file picker to save the dated file locally. Share JSON hands the file to an app of your choosing. Sending through a cloud app requires connectivity later; saving locally does not. Verify the destination received the file. The browser edition retains its share/download fallback.

Import saved calls validates JSON and merges new record IDs, retaining local versions of existing IDs. Saved calls and contacts stay in this app on this device. Uninstalling or clearing app data deletes them; export backups regularly. Android and browser storage are separate. Blank entry fields on launch do not delete saved history.

## WPCRM Handoff

Provide the exported JSON in your dedicated upload chat and sign into WPCRM yourself. Confirm which records to process. Match contacts exactly and stop when unclear. Use Add New > Appointment and enter each record's details, including status and both times. Verify each save and track record IDs to avoid duplicate entry.

appointment_datetime is the start; appointment_end_datetime is the end. status is Open or Completed; completed is No or Yes respectively. Never force Open records to Completed. Legacy imports without end/status use start as end and derive status from the completed flag.

## Verification And Development

The browser/bridge suite has 25 checks. Android instrumentation tests exercise the bundled real model, silent capture and the absence of network permission. See REVIEW.md for run results and remaining physical-phone checks. No customer records are used in tests. The APK, not the source ZIP, is the phone installer.

With Node installed, run node serve.cjs 8081 and open http://127.0.0.1:8081. With Playwright and Edge available, run node verify.cjs. Run package.ps1 after successful tests. Packaging excludes customer data and repository history. Release updates must keep APP_VERSION, app-version metadata, asset versions and cache version aligned.
