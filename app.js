const STORAGE_KEY = "wpcrm-sales-calls-v1";
const JSON_EXPORT_BASENAME = "wpcrm-sales-calls";
const DRAFT_KEY = "wpcrm-call-draft-v1";
let storageBlocked = false;
let editingId = null;
let finishSpeech = null;
let cancelMicrophoneStart = null;

const form = document.querySelector("#call-form");
const contactName = document.querySelector("#contact-name");
const additionalContacts = document.querySelector("#additional-contacts");
const appointmentSubject = document.querySelector("#appointment-subject");
const appointmentDatetime = document.querySelector("#appointment-datetime");
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
const startVoiceButton = document.querySelector("#start-voice");
const voiceStatus = document.querySelector("#voice-status");

let calls = loadCalls();
let toastTimer;
let voiceActive = false;
let voiceRecognition = null;
let pendingVoiceAnswer = null;
let acceptingVoiceAnswer = false;
let voiceStopRequested = false;

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
    completed: call.completed || "Yes",
    appointment_type: call.appointment_type || "Decision-Maker Conference Call",
    mileage: call.mileage || "",
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
    for (const key of ["meeting_group_id", "contact_id", "contact_company"]) if (row[key] != null && typeof row[key] !== "string") throw new Error(`Invalid ${key}.`);
    if (row.mileage != null && typeof row.mileage !== "string" && typeof row.mileage !== "number") throw new Error("Invalid mileage.");
    const call = normalizeCall(row);
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
    wpcrm_workflow: "contact_search_add_completed_appointment",
    contact_name: data.get("contactName").trim(),
    appointment_subject: data.get("appointmentSubject").trim(),
    appointment_datetime: data.get("appointmentDatetime"),
    completed: "Yes",
    appointment_type: appointmentType,
    mileage: isMeeting ? data.get("mileage").trim() : "",
    appointment_notes: data.get("appointmentNotes").trim(),
    actions: data.get("actions").trim(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    recorded_at: calls.find((call) => call.id === editingId)?.recorded_at || new Date().toISOString(),
  };
}

function resetForm() {
  editingId = null;
  document.querySelector("#additional-contacts-field").hidden = false;
  document.querySelector("#save-call").textContent = "Save call";
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* Form still works without draft storage. */ }
  form.reset();
  document.querySelector("#dictation-review").hidden = true;
  document.querySelector("#contact-match").textContent = "";
  contactName.value = "";
  appointmentSubject.value = "";
  appointmentNotes.value = "";
  mileage.value = "";
  document.querySelector('input[name="appointmentType"][value="Decision-Maker Conference Call"]').checked = true;
  appointmentDatetime.value = nowForInput();
  updateMileageVisibility();
  contactName.focus();
}

function setAppointmentType(value) {
  const field = document.querySelector(`input[name="appointmentType"][value="${value}"]`);
  if (field) {
    field.checked = true;
    updateMileageVisibility();
  }
}

function saveCurrentForm() {
  if (!form.reportValidity()) return false;
  const call = createCallFromForm();
  const names = [...new Map([call.contact_name, ...(editingId ? [] : additionalContacts.value.split(/\r?\n/))]
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
    `Appointment type: ${call.appointment_type}`,
    `Date/time: ${formatDateTime(call.appointment_datetime)}`,
    `Completed: ${call.completed}`,
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
    pills[1].textContent = formatDateTime(call.appointment_datetime);
    pills[2].textContent = call.mileage ? `Mileage ${call.mileage}` : "Completed";
    item.querySelector(".appointment-subject").textContent = `Subject: ${call.appointment_subject}`;
    item.querySelector(".meeting-point").textContent = call.appointment_notes;
    item.querySelector(".action-preview").textContent = call.actions ? `Actions: ${call.actions}` : "";
    item.querySelector(".edit-button").addEventListener("click", () => {
      if (voiceActive) return;
      if (hasDraft() && !confirm("Replace the current draft with this saved call?")) return;
      editingId = call.id;
      fillForm(call);
      document.querySelector("#save-call").textContent = "Save changes";
      saveDraft();
      form.scrollIntoView({ behavior: "smooth" });
    });
    item.querySelector(".delete-button").addEventListener("click", () => {
      if (voiceActive || !confirm(`Delete the saved call for ${call.contact_name}? Export a backup first if needed.`)) return;
      if (!saveCalls(calls.filter((savedCall) => savedCall.id !== call.id))) return;
      if (editingId === call.id) resetForm();
      renderCalls();
      showToast("Call deleted");
    });

    callList.append(item);
  }
}

function updateMileageVisibility() {
  const selectedType = new FormData(form).get("appointmentType");
  const isMeeting = selectedType === "Decision-Maker Meeting";
  mileageField.hidden = !isMeeting;
  mileageField.classList.toggle("is-hidden", !isMeeting);
  mileage.required = isMeeting;
  if (!isMeeting) mileage.value = "";
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function hasDraft() {
  return Boolean(contactName.value || additionalContacts.value || appointmentSubject.value || appointmentNotes.value || document.querySelector("#actions").value);
}

function fillForm(call) {
  contactName.value = [call.contact_name, call.contact_company, call.contact_id].filter(Boolean).join(" | ");
  document.querySelector("#spoken-summary").value = call.spoken_summary || "";
  additionalContacts.value = call.additional_contacts || "";
  document.querySelector("#additional-contacts-field").hidden = Boolean(editingId);
  appointmentSubject.value = call.appointment_subject || "";
  appointmentDatetime.value = call.appointment_datetime || nowForInput();
  appointmentNotes.value = call.appointment_notes || "";
  document.querySelector("#actions").value = call.actions || "";
  setAppointmentType(call.appointment_type || "Decision-Maker Conference Call");
  mileage.value = call.mileage || "";
}

function saveDraft() {
  try {
    if (hasDraft() || document.querySelector("#spoken-summary").value) localStorage.setItem(DRAFT_KEY, JSON.stringify({ call: { ...createCallFromForm(), contact_company: "", contact_id: "", additional_contacts: additionalContacts.value, spoken_summary: document.querySelector("#spoken-summary").value }, editingId }));
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
document.querySelector("#check-update").addEventListener("click", async () => {
  saveDraft();
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!navigator.onLine || !registration) throw new Error("Connect to the internet to check updates.");
    await registration.update();
    const worker = registration.installing || registration.waiting;
    if (!worker) { showToast("No update available"); return; }
    const offer = () => {
      if (["installed", "activated"].includes(worker.state)) {
        worker.removeEventListener("statechange", offer);
        document.querySelector("#reload-app").hidden = false;
        showToast("Update ready");
      }
    };
    worker.addEventListener("statechange", offer);
    offer();
  } catch (error) { showToast(error.message || "Update check failed"); }
});
document.querySelector("#reload-app").addEventListener("click", () => { saveDraft(); location.reload(); });

function showNetworkState() {
  document.querySelector("#connection-status").textContent = navigator.onLine ? "Online" : "Offline";
}
window.addEventListener("online", showNetworkState);
window.addEventListener("offline", showNetworkState);

function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const timeout = window.setTimeout(done, 60000);
    function done() {
      window.clearTimeout(timeout);
      finishSpeech = null;
      resolve();
    }
    finishSpeech = done;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
  });
}

function startVoiceRecognition() {
  const SpeechRecognition = getSpeechRecognition();
  return new Promise((resolve) => {
    if (!SpeechRecognition) {
      resolve({ ok: false, message: "Speech recognition is not available in this browser." });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let settled = false;
    let restarts = 0;
    const startupTimeout = window.setTimeout(() => {
      recognition.onend = null;
      recognition.abort();
      settle({ ok: false, message: "Microphone did not start within 10 seconds." });
    }, 10000);
    cancelMicrophoneStart = () => settle({ ok: false, message: "Voice entry stopped." });

    function settle(result) {
      if (settled) return;
      settled = true;
      window.clearTimeout(startupTimeout);
      cancelMicrophoneStart = null;
      resolve(result);
    }

    recognition.onstart = () => {
      setVoiceStatus("Microphone is on. Waiting for the first question...");
      settle({ ok: true });
    };
    recognition.onresult = (event) => {
      if (!acceptingVoiceAnswer || !pendingVoiceAnswer) return;
      const parts = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) parts.push(event.results[i][0].transcript.trim());
      }
      const transcript = parts.join(" ");
      if (!transcript) return;
      restarts = 0;
      setVoiceStatus(`Heard: ${transcript}`);
      if (pendingVoiceAnswer.collect) {
        pendingVoiceAnswer.parts.push(transcript);
        window.clearTimeout(pendingVoiceAnswer.silence);
        if (pendingVoiceAnswer.finishOnSave) {
          const combined = pendingVoiceAnswer.parts.join(" ");
          if (/\bsave it[.!?\s]*$/i.test(combined) && !/\b(?:don['’]?t|do not|not)\s+save it[.!?\s]*$/i.test(combined)) {
            const answer = pendingVoiceAnswer;
            pendingVoiceAnswer = null;
            acceptingVoiceAnswer = false;
            window.clearTimeout(answer.timeout);
            answer.resolve(combined.replace(/\bsave it[.!?\s]*$/i, "").trim());
          }
          return;
        }
        pendingVoiceAnswer.silence = window.setTimeout(() => {
          if (!pendingVoiceAnswer) return;
          const answer = pendingVoiceAnswer;
          pendingVoiceAnswer = null;
          acceptingVoiceAnswer = false;
          window.clearTimeout(answer.timeout);
          answer.resolve(answer.parts.join(" "));
        }, 3500);
        return;
      }
      acceptingVoiceAnswer = false;
      window.clearTimeout(pendingVoiceAnswer.timeout);
      pendingVoiceAnswer.resolve(transcript);
      pendingVoiceAnswer = null;
    };
    recognition.onerror = (event) => {
      if (["not-allowed", "service-not-allowed", "audio-capture", "network"].includes(event.error)) recognition.onend = null;
      const message = event.error === "not-allowed"
        ? "Microphone permission was blocked."
        : `Microphone error: ${event.error || "unknown"}`;

      if (pendingVoiceAnswer) {
        window.clearTimeout(pendingVoiceAnswer.timeout);
        window.clearTimeout(pendingVoiceAnswer.silence);
        pendingVoiceAnswer.reject(new Error(message));
        pendingVoiceAnswer = null;
      }

      settle({ ok: false, message });
    };
    recognition.onend = () => {
      if (voiceActive && !voiceStopRequested && restarts++ < 2) {
        try {
          recognition.start();
        } catch {
          if (pendingVoiceAnswer) {
            window.clearTimeout(pendingVoiceAnswer.timeout);
            window.clearTimeout(pendingVoiceAnswer.silence);
            pendingVoiceAnswer.reject(new Error("Microphone listening stopped."));
            pendingVoiceAnswer = null;
          }
        }
      }
    };

    try {
      recognition.start();
    } catch {
      settle({ ok: false, message: "Microphone listening did not start." });
    }

    voiceRecognition = recognition;
  });
}

function stopVoiceRecognition() {
  cancelMicrophoneStart?.();
  acceptingVoiceAnswer = false;
  if (pendingVoiceAnswer) {
    const answerWait = pendingVoiceAnswer;
    pendingVoiceAnswer = null;
    window.clearTimeout(answerWait.timeout);
    window.clearTimeout(answerWait.silence);
    answerWait.reject(new Error("Voice entry stopped."));
  }
  if (voiceRecognition) {
    voiceRecognition.onend = null;
    voiceRecognition.abort();
    voiceRecognition = null;
  }
}

function stopVoiceEntry() {
  if (!voiceActive) return;
  voiceStopRequested = true;
  setVoiceStatus("Stopping voice entry...");
  window.speechSynthesis?.cancel();
  finishSpeech?.();
  stopVoiceRecognition();
}

function listenForCurrentPrompt(options = {}) {
  return new Promise((resolve, reject) => {
    if (voiceStopRequested) { reject(new Error("Voice entry stopped.")); return; }
    const timeout = window.setTimeout(() => {
      acceptingVoiceAnswer = false;
      const answer = pendingVoiceAnswer;
      window.clearTimeout(answer?.silence);
      pendingVoiceAnswer = null;
      if (answer?.parts.length) resolve(answer.parts.join(" "));
      else reject(new Error("I did not hear anything."));
    }, options.collect ? 60000 : 12000);

    pendingVoiceAnswer = { resolve, reject, timeout, collect: options.collect, finishOnSave: options.finishOnSave, parts: [] };
    acceptingVoiceAnswer = true;
  });
}

async function askOutLoud(question, options = {}) {
  if (!voiceActive) return "";
  const retries = options.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (voiceStopRequested) throw new Error("Voice entry stopped.");
    const prompt = attempt === 0 ? question : `${question} Please say it again.`;
    setVoiceStatus(prompt);
    if (!options.silent) await speak(prompt);
    setVoiceStatus("Listening...");

    try {
      const answer = await listenForCurrentPrompt(options);
      setVoiceStatus(`Heard: ${answer}`);
      return answer;
    } catch (error) {
      if (voiceStopRequested) {
        throw new Error("Voice entry stopped.");
      }
      const message = error.message || "I did not catch that.";
      setVoiceStatus(message);
      if (message.includes("Microphone permission")) {
        throw error;
      }
      if (!options.silent) await speak("I did not catch that.");
    }
  }

  throw new Error("I tried twice and did not hear an answer.");
}

function normalizeSpokenText(text) {
  return text.trim().replace(/\s+/g, " ");
}

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

async function runVoiceEntry(mode = "guided") {
  if (voiceActive) return;
  if (mode === "guided" && hasDraft() && !confirm("Start a new voice entry and replace the current draft?")) return;

  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition || !("speechSynthesis" in window)) {
    showToast("Voice entry is not available in this browser");
    setVoiceStatus("Voice entry needs a browser with speech recognition and speech playback.");
    return;
  }

  voiceActive = true;
  voiceStopRequested = false;
  startVoiceButton.disabled = false;
  startVoiceButton.textContent = "Stop";
  document.querySelector("#dictate-details").textContent = "Stop listening";

  try {
    setVoiceStatus("Starting microphone...");
    const microphone = await startVoiceRecognition();
    if (voiceStopRequested) throw new Error("Voice entry stopped.");
    if (!microphone.ok) {
      const message = microphone.message || "Microphone did not start.";
      setVoiceStatus(`${message} Check browser microphone permission.`);
      await speak("Microphone did not start. Please check browser microphone permission.");
      return;
    }

    if (mode === "summary") { await completeDictation(); return; }
    resetForm();
    setVoiceStatus("Microphone started.");

    contactName.value = normalizeSpokenText(await askOutLoud("Contact name."));
    appointmentSubject.value = normalizeSpokenText(await askOutLoud("Appointment subject."));

    let appointmentType = "";
    for (let attempt = 0; attempt < 2 && !appointmentType; attempt++) {
      const answer = await askOutLoud("Appointment type. Say call or meeting.");
      appointmentType = parseAppointmentType(answer);
      if (!appointmentType) {
        await speak("I did not catch that. Please say call or meeting.");
      }
    }
    if (!appointmentType) throw new Error("Choose call or meeting manually to continue.");
    setAppointmentType(appointmentType);

    const defaultTime = formatDateTime(appointmentDatetime.value);
    const useCurrent = await askOutLoud(`Use the current date and time, ${defaultTime}? Say yes or no.`);
    if (isNo(useCurrent)) {
      const dateAnswer = await askOutLoud("Please say the appointment date and time.");
      const parsedDate = parseSpokenDateTime(dateAnswer);
      if (parsedDate) {
        appointmentDatetime.value = parsedDate;
      } else {
        throw new Error("Date not understood. Enter the date and time manually before saving.");
      }
    } else if (!isYes(useCurrent)) {
      throw new Error("Date not confirmed. Check the date and time before saving.");
    }

    if (appointmentType === "Decision-Maker Meeting") {
      const mileageAnswer = await askOutLoud("Mileage.");
      mileage.value = parseMileage(mileageAnswer);
      if (!mileage.value) {
        await speak("I could not understand the mileage. Please enter it manually before saving.");
      }
    }

    appointmentNotes.value = normalizeSpokenText(await askOutLoud("Appointment notes. Pause for four seconds when finished.", { collect: true }));

    const summary = [
      `Contact ${contactName.value}.`,
      `Subject ${appointmentSubject.value}.`,
      `${appointmentType}.`,
      `Notes ${appointmentNotes.value}.`,
      "Would you like to save this? Say yes or no.",
    ].join(" ");
    const confirmation = await askOutLoud(summary);

    if (isYes(confirmation)) {
      if (saveCurrentForm()) {
        setVoiceStatus("Saved.");
        await speak("Saved.");
      }
    } else if (isNo(confirmation)) {
      setVoiceStatus("Not saved. The form is still filled in.");
      await speak("Not saved. The form is still filled in.");
    } else {
      setVoiceStatus("I did not hear yes or no, so I left the form filled in.");
      await speak("I did not hear yes or no, so I left the form filled in.");
    }
  } catch (error) {
    const message = error.message || "Voice entry stopped.";
    setVoiceStatus(message);
    showToast(message);
  } finally {
    stopVoiceRecognition();
    saveDraft();
    voiceActive = false;
    voiceStopRequested = false;
    startVoiceButton.disabled = false;
    startVoiceButton.textContent = "Start voice";
    document.querySelector("#dictate-details").textContent = "Dictate details";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCurrentForm();
});

resetFormButton.addEventListener("click", () => {
  if (voiceActive) { stopVoiceEntry(); return; }
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

startVoiceButton.addEventListener("click", () => {
  if (voiceActive) {
    stopVoiceEntry();
    return;
  }
  runVoiceEntry();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

form.reset();
form.querySelectorAll('input[type="text"], input[type="number"], input[type="datetime-local"], textarea').forEach(field => { field.value = ""; });
form.querySelectorAll('input[name="appointmentType"]').forEach(field => { field.checked = false; });
updateMileageVisibility();
renderCalls();
showNetworkState();
if (!getSpeechRecognition()) {
  startVoiceButton.disabled = true;
  setVoiceStatus("Guided voice unavailable in this browser. Keyboard dictation is still an option.");
}
