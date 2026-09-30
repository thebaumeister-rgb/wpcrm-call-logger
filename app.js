const APP_VERSION = 32;
const STORAGE_KEY = "wpcrm-sales-calls-v1";
const JSON_EXPORT_BASENAME = "wpcrm-sales-calls";
const DRAFT_KEY = "wpcrm-call-draft-v1";
let storageBlocked = false;
let editingId = null;

const form = document.querySelector("#call-form");
const contactName = document.querySelector("#contact-name");
const additionalContacts = document.querySelector("#additional-contacts");
const appointmentSubject = document.querySelector("#appointment-subject");
const appointmentDatetime = document.querySelector("#appointment-datetime");
const appointmentEndDatetime = document.querySelector("#appointment-end-datetime");
const appointmentStatus = document.querySelector("#appointment-status");
const appointmentNotes = document.querySelector("#appointment-notes");
const mileage = document.querySelector("#mileage");
const mileageField = document.querySelector("#mileage-field");
const callList = document.querySelector("#call-list");
const emptyState = document.querySelector("#empty-state");
const entryCount = document.querySelector("#entry-count");
const toast = document.querySelector("#toast");

const resetFormButton = document.querySelector("#reset-form");
const copyLatestButton = document.querySelector("#copy-latest");
const exportCsvButton = document.querySelector("#export-csv");
const exportJsonButton = document.querySelector("#export-json");
const shareJsonButton = document.querySelector("#share-json");
const voiceStatus = document.querySelector("#voice-status");

let calls = loadCalls();
let toastTimer;

function nowForInput() {
  const date = new Date();
  date.setSeconds(0, 0);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function loadCalls() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? validateCalls(JSON.parse(raw)) : [];
  } catch {
    storageBlocked = true;
    document.querySelector("#storage-warning").hidden = false;
    return [];
  }
}

function normalizeCall(call) {
  return {
    id: call.id || crypto.randomUUID(),
    meeting_group_id: call.meeting_group_id || "",
    contact_id: call.contact_id || "",
    contact_company: call.contact_company || "",
    wpcrm_workflow: call.wpcrm_workflow || "contact_search_add_completed_appointment",
    contact_name: call.contact_name || "",
    appointment_subject: call.appointment_subject || call.meeting_point || "",
    appointment_datetime: call.appointment_datetime || "",
    appointment_end_datetime: call.appointment_end_datetime ?? call.appointment_datetime ?? "",
    status: call.status ?? (call.completed === "No" ? "Open" : "Completed"),
    completed: call.status ? (call.status === "Completed" ? "Yes" : "No") : (call.completed || "Yes"),
    appointment_type: call.appointment_type || "Decision-Maker Conference Call",
    mileage: call.mileage ?? "",
    appointment_notes: call.appointment_notes || call.actions || call.meeting_point || "",
    recorded_at: call.recorded_at || "",
    actions: call.actions || "",
    timezone: call.timezone || "",
  };
}

function saveCalls(next = calls) {
  if (storageBlocked) {
    showToast("Storage could not be read. Recover the original data before saving.");
    return false;
  }
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing !== lastStoredCalls) {
      showToast("Calls changed in another window. Reload before saving; your form is still here.");
      return false;
    }
    const serialized = JSON.stringify(next);
    localStorage.setItem(STORAGE_KEY, serialized);
    lastStoredCalls = serialized;
    calls = next;
    return true;
  } catch {
    showToast("Could not save on this device. Your form has been kept.");
    return false;
  }
}

let lastStoredCalls;
try { lastStoredCalls = localStorage.getItem(STORAGE_KEY); } catch { storageBlocked = true; }

function validateCalls(rows) {
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error("Expected a JSON list of calls (maximum 10,000).");
  const ids = new Set();
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid call record.");
    for (const key of ["id", "contact_name", "appointment_subject", "appointment_datetime", "appointment_type", "appointment_notes", "actions", "timezone", "recorded_at", "meeting_point", "completed", "wpcrm_workflow"]) {
      if (row[key] != null && typeof row[key] !== "string") throw new Error(`Invalid ${key}.`);
    }
    for (const key of ["meeting_group_id", "contact_id", "contact_company", "status", "appointment_end_datetime"]) if (row[key] != null && typeof row[key] !== "string") throw new Error(`Invalid ${key}.`);
    if (row.mileage != null && typeof row.mileage !== "string" && typeof row.mileage !== "number") throw new Error("Invalid mileage.");
    const call = normalizeCall(row);
    if (!["Open", "Completed"].includes(call.status)) throw new Error("Choose Open or Completed.");
    if (row.status && row.completed && row.completed !== (row.status === "Completed" ? "Yes" : "No")) throw new Error("Status and completed flag disagree.");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(call.appointment_end_datetime) || Number.isNaN(Date.parse(call.appointment_end_datetime)) || Date.parse(call.appointment_end_datetime) < Date.parse(call.appointment_datetime)) throw new Error("End time must be valid and not earlier than start time.");
    if (!call.contact_name.trim() || !call.appointment_subject.trim() || !call.appointment_notes.trim() || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(call.appointment_datetime) || Number.isNaN(Date.parse(call.appointment_datetime))) throw new Error("A call is missing required details or has an invalid date.");
    if (!["Decision-Maker Conference Call", "Decision-Maker Meeting"].includes(call.appointment_type)) throw new Error("Unknown appointment type.");
    if (call.mileage !== "" && (!Number.isFinite(Number(call.mileage)) || Number(call.mileage) < 0)) throw new Error("Invalid mileage.");
    if (ids.has(call.id)) throw new Error("Duplicate record IDs in file.");
    ids.add(call.id);
    return call;
  });
}

function getJsonExport() {
  return JSON.stringify(calls, null, 2);
}

function getTimestampedJsonFilename() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    String(date.getMilliseconds()).padStart(3, "0"),
  ].join("-");
  return `${JSON_EXPORT_BASENAME}-${timestamp}.json`;
}

async function shareJsonExport() {
  const status = document.querySelector("#share-status");
  status.hidden = true;
  if (!calls.length) {
    showToast("No saved calls to share");
    return;
  }

  const filename = getTimestampedJsonFilename();
  const contents = getJsonExport();
  if (window.OfflineAndroid) {
    OfflineAndroid.exportFile(filename, contents, "application/json", true);
    return;
  }
  const file = new File([contents], filename, {
    type: "application/json",
  });

  try {
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file] });
      showToast("File handed to sharing app");
      return;
    }
  } catch (error) {
    if (error.name === "AbortError") { showToast("Sharing canceled. Saved calls are unchanged."); return; }
  }

  downloadFile(filename, contents, "application/json");
  status.textContent = `Sharing was blocked or unavailable. A download was requested: ${filename}. On your phone, open My Files > Downloads, select the file, then tap Share. If it is missing, tap Export JSON to retry. Your saved calls are unchanged.`;
  status.hidden = false;
  showToast("Sharing unavailable. Check Downloads or tap Export JSON.");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function setVoiceStatus(message) {
  voiceStatus.textContent = message;
}

function createCallFromForm() {
  const data = new FormData(form);
  const appointmentType = data.get("appointmentType");
  const isMeeting = appointmentType === "Decision-Maker Meeting";

  return {
    id: editingId || crypto.randomUUID(),
    meeting_group_id: calls.find((call) => call.id === editingId)?.meeting_group_id || "",
    contact_id: calls.find((call) => call.id === editingId)?.contact_id || "",
    contact_company: calls.find((call) => call.id === editingId)?.contact_company || "",
    wpcrm_workflow: "contact_search_add_appointment",
    contact_name: data.get("contactName").trim(),
    appointment_subject: data.get("appointmentSubject").trim(),
    appointment_datetime: data.get("appointmentDatetime"),
    appointment_end_datetime: data.get("appointmentEndDatetime"),
    status: data.get("appointmentStatus"),
    completed: data.get("appointmentStatus") === "Completed" ? "Yes" : "No",
    appointment_type: appointmentType,
    mileage: data.get("mileage").trim(),
    appointment_notes: data.get("appointmentNotes").trim(),
    actions: data.get("actions").trim(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    recorded_at: calls.find((call) => call.id === editingId)?.recorded_at || new Date().toISOString(),
  };
}

function resetForm({ focusContact = true } = {}) {
  const fieldDictationEnabled = document.querySelector("#dictate-on-tap").checked;
  editingId = null;
  document.querySelector("#additional-contacts-field").hidden = false;
  document.querySelector("#save-call").textContent = "Save";
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* Form still works without draft storage. */ }
  form.reset();
  document.querySelector("#dictate-on-tap").checked = fieldDictationEnabled;
  document.querySelector("#contact-match").textContent = "";
  contactName.value = "";
  appointmentSubject.value = "";
  appointmentNotes.value = "";
  mileage.value = "";
  document.querySelector('input[name="appointmentType"][value="Decision-Maker Conference Call"]').checked = true;
  appointmentDatetime.value = nowForInput();
  appointmentEndDatetime.value = appointmentDatetime.value;
  appointmentStatus.value = "Completed";
  updateMileageVisibility();
  if (focusContact) contactName.focus();
}

function setAppointmentType(value) {
  const field = document.querySelector(`input[name="appointmentType"][value="${value}"]`);
  if (field) {
    field.checked = true;
    updateMileageVisibility();
  }
}

function splitAdditionalContacts(value) {
  return value.split(/\r?\n/).flatMap(line => line.includes("|") ? [line] : line.split(/,|\s+comma\s+/i)).map(name => name.trim()).filter(Boolean);
}

function saveCurrentForm() {
  if (!form.reportValidity()) return false;
  const call = createCallFromForm();
  const names = [...new Map([call.contact_name, ...(editingId ? [] : splitAdditionalContacts(additionalContacts.value))]
    .map((name) => name.trim()).filter(Boolean).map((name) => [name.toLocaleLowerCase(), name])).values()];
  if (names.length > 50) { showToast("Limit each meeting to 50 contacts."); return false; }
  const groupId = names.length > 1 ? crypto.randomUUID() : call.meeting_group_id;
  let records = names.map((name, index) => ({ ...call, contact_name: name,
    id: index === 0 ? call.id : crypto.randomUUID(), meeting_group_id: groupId,
    mileage: index === 0 ? call.mileage : (call.mileage === "" ? "" : "0") }));
  if (typeof confirmContactRecords === "function") {
    records = confirmContactRecords(records);
    if (!records) return false;
  }
  try { validateCalls(records); } catch (error) { showToast(error.message); return false; }
  if (records.length > 1 && !confirm(`Save ${records.length} separate appointments with the same notes and actions?\n\n${names.join("\n")}\n\nMileage is recorded only on the first contact. Later edits apply to one appointment at a time.`)) return false;
  const next = editingId ? calls.map((item) => item.id === editingId ? records[0] : item) : [...records, ...calls];
  if (!saveCalls(next)) return false;
  renderCalls();
  resetForm();
  showToast(records.length > 1 ? `${records.length} contact appointments saved` : "Call saved");
  return true;
}

function callToText(call) {
  return [
    `Contact: ${call.contact_name}`,
    `Appointment subject: ${call.appointment_subject}`,
    `Start: ${formatDateTime(call.appointment_datetime)}`,
    `End: ${formatDateTime(call.appointment_end_datetime)}`,
    `Status: ${call.status || ""}`,
    `Purpose: ${call.appointment_type || ""}`,
    `Mileage: ${call.mileage || "None"}`,
    `Appointment notes:`,
    call.appointment_notes,
    `Actions: ${call.actions || "None"}`,
  ].join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function toCsv(rows) {
  const fields = [
    "id",
    "wpcrm_workflow",
    "contact_name",
    "appointment_subject",
    "appointment_type",
    "appointment_datetime",
    "appointment_end_datetime",
    "status",
    "completed",
    "mileage",
    "appointment_notes",
    "recorded_at",
    "actions",
    "timezone",
    "meeting_group_id",
    "contact_id",
    "contact_company",
  ];
  const header = fields.join(",");
  const body = rows.map((row) => fields.map((field) => csvEscape(row[field])).join(","));
  return [header, ...body].join("\n");
}

function downloadFile(filename, contents, type) {
  if (window.OfflineAndroid) {
    OfflineAndroid.exportFile(filename, contents, type, false);
    return;
  }
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function renderCalls() {
  entryCount.textContent = String(calls.length);
  document.querySelector('#delete-all-calls').disabled = !calls.length || storageBlocked;
  emptyState.hidden = calls.length > 0;
  callList.innerHTML = "";

  for (const call of calls) {
    const item = document.createElement("li");
    item.className = "call-card";
    item.innerHTML = `
      <header>
        <div>
          <h3></h3>
          <div class="call-meta">
            <span class="pill"></span>
            <span class="pill"></span>
            <span class="pill mileage-pill"></span>
          </div>
        </div>
        <div class="record-actions"><button class="edit-button" type="button">Edit</button><button class="delete-button" type="button" aria-label="Delete saved call">Delete</button></div>
      </header>
      <p class="appointment-subject"></p>
      <p class="meeting-point"></p>
      <p class="action-preview"></p>
    `;

    item.querySelector("h3").textContent = call.contact_name;
    const pills = item.querySelectorAll(".pill");
    pills[0].textContent = call.appointment_type;
    pills[1].textContent = `${formatDateTime(call.appointment_datetime)} - ${formatDateTime(call.appointment_end_datetime)}`;
    pills[2].textContent = `${call.status} | Mileage ${call.mileage || "0"}`;
    item.querySelector(".appointment-subject").textContent = `Subject: ${call.appointment_subject}`;
    item.querySelector(".meeting-point").textContent = call.appointment_notes;
    item.querySelector(".action-preview").textContent = call.actions ? `Actions: ${call.actions}` : "";
    item.querySelector(".edit-button").addEventListener("click", () => {
      stopFieldDictation();
      if (hasDraft() && !confirm("Replace the current draft with this saved call?")) return;
      editingId = call.id;
      fillForm(call);
      document.querySelector("#save-call").textContent = "Save changes";
      saveDraft();
      form.scrollIntoView({ behavior: "smooth" });
    });
    item.querySelector(".delete-button").addEventListener("click", () => {
      if (!confirm(`Delete the saved call for ${call.contact_name}? Export a backup first if needed.`)) return;
      if (!saveCalls(calls.filter((savedCall) => savedCall.id !== call.id))) return;
      if (editingId === call.id) resetForm();
      renderCalls();
      showToast("Call deleted");
    });

    callList.append(item);
  }
}

function updateMileageVisibility() {
  mileageField.hidden = false;
  mileageField.classList.remove("is-hidden");
  mileage.required = true;
}

document.querySelector('#delete-all-calls').addEventListener('click', () => {
  stopFieldDictation();
  if (!calls.length) return;
  const count = calls.length;
  if (!confirm(`Delete ALL ${count} saved calls from this device?\n\nFirst verify that every call was successfully imported into WPCRM and keep your exported JSON backup. This app cannot verify the WPCRM import.\n\nThis cannot be undone. Your contact list, current entry and exported files will remain.`)) return;
  if (!saveCalls([])) return;
  // Preserve an open edit as an unsaved new entry, without a deleted record ID.
  if (editingId) {
    editingId = null;
    document.querySelector('#save-call').textContent = 'Save';
    document.querySelector('#additional-contacts-field').hidden = false;
    saveDraft();
  }
  renderCalls();
  showToast(`${count} saved calls deleted. Exported files were not changed.`);
});

function getSpeechRecognition() {
  return window.OfflineSpeechRecognition;
}

function hasDraft() {
  return Boolean(contactName.value || additionalContacts.value || appointmentSubject.value || appointmentNotes.value || document.querySelector("#actions").value);
}

function fillForm(call) {
  contactName.value = [call.contact_name, call.contact_company, call.contact_id].filter(Boolean).join(" | ");
  additionalContacts.value = call.additional_contacts || "";
  document.querySelector("#additional-contacts-field").hidden = Boolean(editingId);
  appointmentSubject.value = call.appointment_subject || "";
  appointmentDatetime.value = call.appointment_datetime || nowForInput();
  appointmentEndDatetime.value = call.appointment_end_datetime || appointmentDatetime.value;
  appointmentStatus.value = call.status || (call.completed === "No" ? "Open" : "Completed");
  appointmentNotes.value = call.appointment_notes || "";
  document.querySelector("#actions").value = call.actions || "";
  setAppointmentType(call.appointment_type || "Decision-Maker Conference Call");
  mileage.value = call.mileage || "";
}

function saveDraft() {
  try {
    if (hasDraft()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ call: { ...createCallFromForm(), contact_company: "", contact_id: "", additional_contacts: additionalContacts.value }, editingId }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { showToast("Draft could not be backed up on this device."); }
}

form.addEventListener("input", saveDraft);
form.addEventListener("change", saveDraft);
window.addEventListener("pagehide", saveDraft);

document.querySelector("#import-json").addEventListener("click", () => document.querySelector("#import-file").click());
document.querySelector("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("File exceeds the 10 MB import limit.");
    const imported = validateCalls(JSON.parse(await file.text()));
    const ids = new Set(calls.map((call) => call.id));
    const fresh = imported.filter((call) => !ids.has(call.id));
    if (fresh.length && !saveCalls([...fresh, ...calls])) return;
    renderCalls();
    showToast(`${fresh.length} imported; ${imported.length - fresh.length} existing records skipped`);
  } catch (error) { showToast(`Import failed: ${error.message}`); }
  finally { event.target.value = ""; }
});

document.querySelector("#recover-storage").addEventListener("click", () => {
  try { downloadFile("wpcrm-storage-recovery.txt", localStorage.getItem(STORAGE_KEY) || "", "text/plain"); }
  catch { showToast("Browser storage is unavailable. Try the original browser profile."); }
});

let installPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  document.querySelector("#install-app").hidden = false;
});
document.querySelector("#install-app").addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  document.querySelector("#install-app").hidden = true;
});
let availableVersion = null;
function reportUpdate(message) {
  document.querySelector("#update-status").textContent = message;
}

function reloadAvailableUpdate() {
  if (!availableVersion) return;
  const unfinished = hasDraft() || appointmentDatetime.value || appointmentEndDatetime.value || appointmentStatus.value || mileage.value || new FormData(form).get("appointmentType");
  const warning = unfinished || fieldSession ? " Any unfinished entry will be cleared and dictation stopped. Saved calls and contacts will remain." : " Saved calls and contacts will remain.";
  if (!confirm(`Install Version ${availableVersion} and reload now?${warning}`)) return;
  stopFieldDictation();
  const url = new URL("index.html", location.href);
  url.searchParams.set("v", availableVersion);
  url.searchParams.set("reload", Date.now());
  location.assign(url.href);
}

document.querySelector("#check-update").addEventListener("click", async () => {
  if (window.OfflineAndroid) { OfflineAndroid.openUpdates(); return; }
  const button = document.querySelector("#check-update");
  button.disabled = true;
  availableVersion = null;
  document.querySelector("#reload-app").hidden = true;
  reportUpdate("Checking the published version...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    if (!navigator.onLine) throw new Error("You are offline. Connect to the internet and try again.");
    const url = new URL("index.html", location.href);
    url.searchParams.set("update-check", Date.now());
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("Could not check the published app. Please try again.");
    const latest = new DOMParser().parseFromString(await response.text(), "text/html");
    const version = Number(latest.querySelector('meta[name="app-version"]')?.content);
    if (!Number.isInteger(version) || version < 1) throw new Error("The update response could not be verified. Please try again.");
    if (version < APP_VERSION) throw new Error("The server is returning an older release. Try again shortly.");
    if (version === APP_VERSION) { reportUpdate(`Version ${APP_VERSION} is up to date.`); return; }
    availableVersion = version;
    reportUpdate(`Version ${version} is available. Reload to install it.`);
    document.querySelector("#reload-app").hidden = false;
    // Detect the published page version even when the worker has already activated.
    navigator.serviceWorker?.getRegistration().then(registration => registration?.update()).catch(() => {});
    reloadAvailableUpdate();
  } catch (error) {
    reportUpdate(error.name === "AbortError" ? "Update check timed out. Please try again." : (error.message || "Update check failed. Please try again."));
  } finally { clearTimeout(timeout); button.disabled = false; }
});
document.querySelector("#reload-app").addEventListener("click", reloadAvailableUpdate);

function showNetworkState() {
  document.querySelector("#connection-status").textContent = window.OfflineAndroid ? "On-device speech available" : "Browser mode";
}
window.addEventListener("online", showNetworkState);
window.addEventListener("offline", showNetworkState);

function parseAppointmentType(answer) {
  const normalized = answer.toLowerCase();
  if (normalized.includes("meet")) return "Decision-Maker Meeting";
  if (normalized.includes("call") || normalized.includes("conference")) {
    return "Decision-Maker Conference Call";
  }
  return "";
}

function isYes(answer) {
  return !isNo(answer) && /^(yes|yeah|yep|save|correct|right|ok|okay)(\b|[.!])/i.test(answer.trim());
}

function isNo(answer) {
  return /\b(no|nope|cancel|discard|not|don['’]?t|do not)\b/i.test(answer);
}

function parseSpokenDateTime(answer) {
  const parsed = new Date(answer);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseMileage(answer) {
  const digitMatch = answer.match(/\d+(\.\d+)?/);
  if (digitMatch) return digitMatch[0];

  const words = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  const total = answer
    .toLowerCase()
    .split(/[\s-]+/)
    .reduce((sum, word) => word === "hundred" ? sum * 100 : sum + (words[word] || 0), 0);

  return total || /\bzero\b/i.test(answer) ? String(total) : "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCurrentForm();
});

resetFormButton.addEventListener("click", () => {
  stopFieldDictation();
  if (hasDraft() && !confirm("Clear this draft? Saved calls are kept.")) return;
  resetForm();
  showToast("Form cleared");
});

form.addEventListener("change", (event) => {
  if (event.target.name === "appointmentType") {
    updateMileageVisibility();
  }
});

copyLatestButton.addEventListener("click", async () => {
  if (!calls.length) {
    showToast("No saved calls to copy");
    return;
  }

  try {
    if (window.OfflineAndroid) { OfflineAndroid.copyText(callToText(calls[0])); return; }
    await navigator.clipboard.writeText(callToText(calls[0]));
    showToast("Latest call copied");
  } catch {
    showToast("Copy failed; export instead");
  }
});

exportCsvButton.addEventListener("click", () => {
  if (!calls.length) {
    showToast("No saved calls to export");
    return;
  }
  downloadFile(getTimestampedJsonFilename().replace(/\.json$/, ".csv"), toCsv(calls), "text/csv;charset=utf-8");
});

exportJsonButton.addEventListener("click", () => {
  if (!calls.length) {
    showToast("No saved calls to export");
    return;
  }
  downloadFile(getTimestampedJsonFilename(), getJsonExport(), "application/json");
});

shareJsonButton.addEventListener("click", async () => {
  try {
    await shareJsonExport();
  } catch (error) {
    if (error.name === "AbortError") return;
    showToast(error.message || "Share failed; export instead");
  }
});

if ("serviceWorker" in navigator && !window.OfflineAndroid) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

form.reset();
form.querySelectorAll('input[type="text"], input[type="number"], input[type="datetime-local"], textarea').forEach(field => { field.value = ""; });
appointmentDatetime.value = nowForInput();
appointmentEndDatetime.value = appointmentDatetime.value;
form.querySelectorAll('input[name="appointmentType"]').forEach(field => { field.checked = false; });
updateMileageVisibility();
renderCalls();
showNetworkState();
if (!getSpeechRecognition()) {
  setVoiceStatus("Offline dictation requires the WPCRM Offline Android app. Typing and exports still work here.");
}
