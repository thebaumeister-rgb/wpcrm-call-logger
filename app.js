const STORAGE_KEY = "wpcrm-sales-calls-v1";

const form = document.querySelector("#call-form");
const contactName = document.querySelector("#contact-name");
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
    return raw ? JSON.parse(raw).map(normalizeCall) : [];
  } catch {
    return [];
  }
}

function normalizeCall(call) {
  return {
    id: call.id || String(Date.now()),
    wpcrm_workflow: call.wpcrm_workflow || "contact_search_add_completed_appointment",
    contact_name: call.contact_name || "",
    appointment_subject: call.appointment_subject || call.meeting_point || "",
    appointment_datetime: call.appointment_datetime || "",
    completed: call.completed || "Yes",
    appointment_type: call.appointment_type || "Decision-Maker Conference Call",
    mileage: call.mileage || "",
    appointment_notes: call.appointment_notes || call.actions || call.meeting_point || "",
    recorded_at: call.recorded_at || "",
  };
}

function saveCalls() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calls));
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
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    wpcrm_workflow: "contact_search_add_completed_appointment",
    contact_name: data.get("contactName").trim(),
    appointment_subject: data.get("appointmentSubject").trim(),
    appointment_datetime: data.get("appointmentDatetime"),
    completed: "Yes",
    appointment_type: appointmentType,
    mileage: isMeeting ? data.get("mileage").trim() : "",
    appointment_notes: data.get("appointmentNotes").trim(),
    recorded_at: new Date().toISOString(),
  };
}

function resetForm() {
  form.reset();
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
  calls.unshift(call);
  saveCalls();
  renderCalls();
  resetForm();
  showToast("Call saved");
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
  ].join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows) {
  const fields = [
    "wpcrm_workflow",
    "contact_name",
    "appointment_subject",
    "appointment_type",
    "appointment_datetime",
    "completed",
    "mileage",
    "appointment_notes",
    "recorded_at",
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
  URL.revokeObjectURL(url);
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
        <button class="delete-button" type="button" aria-label="Delete saved call">Del</button>
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
    item.querySelector(".action-preview").textContent = "WPCRM path: Contact page, search contact, add new appointment";
    item.querySelector(".delete-button").addEventListener("click", () => {
      calls = calls.filter((savedCall) => savedCall.id !== call.id);
      saveCalls();
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

function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = resolve;
    utterance.onerror = resolve;
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

    function settle(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    recognition.onstart = () => {
      setVoiceStatus("Microphone is on. Waiting for the first question...");
      settle({ ok: true });
    };
    recognition.onresult = (event) => {
      if (!acceptingVoiceAnswer || !pendingVoiceAnswer) return;
      const result = event.results[event.resultIndex];
      if (!result.isFinal) return;

      const transcript = result[0].transcript.trim();
      if (!transcript) return;

      setVoiceStatus(`Heard: ${transcript}`);
      acceptingVoiceAnswer = false;
      window.clearTimeout(pendingVoiceAnswer.timeout);
      pendingVoiceAnswer.resolve(transcript);
      pendingVoiceAnswer = null;
    };
    recognition.onerror = (event) => {
      const message = event.error === "not-allowed"
        ? "Microphone permission was blocked."
        : `Microphone error: ${event.error || "unknown"}`;

      if (pendingVoiceAnswer) {
        window.clearTimeout(pendingVoiceAnswer.timeout);
        pendingVoiceAnswer.reject(new Error(message));
        pendingVoiceAnswer = null;
      }

      settle({ ok: false, message });
    };
    recognition.onend = () => {
      if (voiceActive) {
        try {
          recognition.start();
        } catch {
          if (pendingVoiceAnswer) {
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
  acceptingVoiceAnswer = false;
  if (pendingVoiceAnswer) {
    const answerWait = pendingVoiceAnswer;
    pendingVoiceAnswer = null;
    window.clearTimeout(answerWait.timeout);
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
  stopVoiceRecognition();
}

function listenForCurrentPrompt() {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      acceptingVoiceAnswer = false;
      pendingVoiceAnswer = null;
      reject(new Error("I did not hear anything."));
    }, 12000);

    pendingVoiceAnswer = { resolve, reject, timeout };
    acceptingVoiceAnswer = true;
  });
}

async function askOutLoud(question, options = {}) {
  if (!voiceActive) return "";
  const retries = options.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const prompt = attempt === 0 ? question : `${question} Please say it again.`;
    setVoiceStatus(prompt);
    await speak(prompt);
    setVoiceStatus("Listening...");

    try {
      const answer = await listenForCurrentPrompt();
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
      await speak("I did not catch that.");
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
  return /\b(yes|yeah|yep|save|correct|right|ok|okay)\b/i.test(answer);
}

function isNo(answer) {
  return /\b(no|nope|cancel|discard|not)\b/i.test(answer);
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
    .reduce((sum, word) => sum + (words[word] || 0), 0);

  return total ? String(total) : "";
}

async function runVoiceEntry() {
  if (voiceActive) return;

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

  try {
    setVoiceStatus("Starting microphone...");
    const microphone = await startVoiceRecognition();
    if (!microphone.ok) {
      const message = microphone.message || "Microphone did not start.";
      setVoiceStatus(`${message} Check browser microphone permission.`);
      await speak("Microphone did not start. Please check browser microphone permission.");
      return;
    }

    resetForm();
    setVoiceStatus("Microphone started.");

    contactName.value = normalizeSpokenText(await askOutLoud("Contact name."));
    appointmentSubject.value = normalizeSpokenText(await askOutLoud("Appointment subject."));

    let appointmentType = "";
    while (!appointmentType && voiceActive) {
      const answer = await askOutLoud("Appointment type. Say call or meeting.");
      appointmentType = parseAppointmentType(answer);
      if (!appointmentType) {
        await speak("I did not catch that. Please say call or meeting.");
      }
    }
    setAppointmentType(appointmentType);

    const defaultTime = formatDateTime(appointmentDatetime.value);
    const useCurrent = await askOutLoud(`Use the current date and time, ${defaultTime}? Say yes or no.`);
    if (isNo(useCurrent)) {
      const dateAnswer = await askOutLoud("Please say the appointment date and time.");
      const parsedDate = parseSpokenDateTime(dateAnswer);
      if (parsedDate) {
        appointmentDatetime.value = parsedDate;
      } else {
        await speak("I could not understand that date. I kept the current date and time.");
      }
    }

    if (appointmentType === "Decision-Maker Meeting") {
      const mileageAnswer = await askOutLoud("Mileage.");
      mileage.value = parseMileage(mileageAnswer);
      if (!mileage.value) {
        await speak("I could not understand the mileage. Please enter it manually before saving.");
      }
    }

    appointmentNotes.value = normalizeSpokenText(await askOutLoud("Appointment notes."));

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
    voiceActive = false;
    voiceStopRequested = false;
    startVoiceButton.disabled = false;
    startVoiceButton.textContent = "Start voice";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCurrentForm();
});

resetFormButton.addEventListener("click", () => {
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
  downloadFile("wpcrm-sales-calls.csv", toCsv(calls), "text/csv;charset=utf-8");
});

exportJsonButton.addEventListener("click", () => {
  if (!calls.length) {
    showToast("No saved calls to export");
    return;
  }
  downloadFile("wpcrm-sales-calls.json", JSON.stringify(calls, null, 2), "application/json");
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

appointmentDatetime.value = nowForInput();
updateMileageVisibility();
renderCalls();
