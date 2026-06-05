# WPCRM Call Logger

A mobile-friendly app for recording WPCRM appointment details before entering them into WPCRM at the end of the day.

## What It Does

- Prompts for contact name to search on the WPCRM Contact page
- Prompts for appointment subject
- Prompts for appointment type: `Decision-Maker Conference Call` or `Decision-Maker Meeting`
- Defaults the date/time to the current date and time
- Marks the appointment as completed in the saved record
- Prompts for mileage only when the type is `Decision-Maker Meeting`
- Captures appointment notes
- Saves entries locally on the phone
- Supports voice-guided entry for driving-style use after tapping Start voice
- Exports saved calls as CSV or JSON
- Shares the JSON file through the phone share sheet for saving to OneDrive, email, or another app
- Copies the latest call as formatted text for WPCRM entry

## Voice Entry

Tap `Start voice` and the app will ask:

1. Contact name
2. Appointment subject
3. Appointment type, say `call` or `meeting`
4. Whether to use the current date and time
5. Mileage, only for a meeting
6. Appointment notes
7. Whether to save the entry

While voice entry is active, the same button changes to `Stop`. Tap it to stop listening.

For each spoken answer, the app tries twice. If it still does not hear an answer, it stops and leaves the form available for manual entry.

Phone browsers require a tap before microphone listening can start, so the app cannot begin listening automatically just from opening the home-screen icon.

The app starts one microphone listening session immediately after the `Start voice` tap and reuses it through the questions. If the browser blocks microphone permission, it will show that in the voice status line instead of ending silently.

Voice entry depends on browser speech support. Chrome on Android is the strongest target. iPhone support may vary by iOS and Safari version.

## Phone Export And Sharing

The app stores calls locally on the phone until you export or share them.

Recommended end-of-day workflow:

1. Tap `Share JSON`.
2. Choose the OneDrive app, email, or another available share target.
3. Save the file as `wpcrm-sales-calls.json`.
4. Put it in a `WPCRMCalls` folder if OneDrive offers folder selection.
5. On the office PC, use the synced file for the WPCRM upload workflow.

If the browser or phone does not support file sharing from the web app, `Share JSON` falls back to a normal JSON download. `Export JSON` is also available as a direct download option.

## WPCRM Entry Workflow Captured

The saved records are structured for this later workflow:

1. Go to the WPCRM Contact page.
2. Search for the saved contact name.
3. Select the matching contact.
4. Click Add New Appointment.
5. Enter appointment subject.
6. Enter the saved date and time.
7. Mark the appointment completed.
8. Choose the saved appointment type.
9. Enter mileage if it is an in-person decision-maker meeting.
10. Enter appointment notes.
11. Click OK.

## Run Locally

From this folder:

```powershell
.\serve-local.ps1 8080
```

Then open:

```text
http://localhost:8080
```

Any static web server works. The app files are plain HTML, CSS, and JavaScript.

## Test From A Phone On The Same Network

Start the phone-test server:

```powershell
.\serve-phone.ps1 8081
```

Then open this on a phone connected to the same Wi-Fi/network:

```text
http://192.168.1.15:8081/index.html?v=12
```

This is useful for testing the form and export flow. Voice recognition may still require HTTPS depending on the phone browser.

## Install On A Phone

To install it like an app on Android or iPhone, host this folder on an HTTPS site.

Good simple options:

- GitHub Pages
- Netlify
- Vercel
- Your own HTTPS web server

Then open the site on the phone.

On iPhone:

- Open in Safari
- Tap Share
- Tap Add to Home Screen

On Android:

- Open in Chrome
- Tap the menu
- Tap Add to Home screen or Install app

## Files

- `index.html` - app screen
- `styles.css` - mobile layout
- `app.js` - saving, export, copy, and history behavior
- `manifest.webmanifest` - install metadata
- `service-worker.js` - offline cache
- `icon.svg` - app icon
- `serve-local.ps1` - simple local test server
- `serve-phone.ps1` - local network test server for phone testing

The earlier command-line versions remain available:

- `wpcrm_call_logger.ps1`
- `wpcrm_call_logger.py`
