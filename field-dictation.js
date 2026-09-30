const fieldDictationToggle = document.querySelector("#dictate-on-tap");
const fieldMicrophone = document.querySelector("#field-microphone");
const fieldMicrophoneStatus = document.querySelector("#field-microphone-status");
const fieldTargets = new Set(["contact-name", "additional-contacts", "appointment-subject", "appointment-datetime", "appointment-end-datetime", "appointment-status", "mileage", "appointment-notes", "actions"]);
let fieldSession = null;

try { fieldDictationToggle.checked = localStorage.getItem("wpcrm-dictate-on-tap") !== "false"; } catch { /* Optional preference. */ }

function stopFieldDictation(message = "Microphone stopped. Your entry is kept.") {
  const session = fieldSession;
  fieldSession = null;
  if (session) {
    clearTimeout(session.startTimer); clearTimeout(session.limitTimer);
    session.recognition.onstart = session.recognition.onresult = session.recognition.onerror = session.recognition.onend = null;
    try { session.recognition.abort(); } catch { /* Already stopped. */ }
    setVoiceStatus(message);
  }
  fieldMicrophone.hidden = true;
  document.body.classList.remove("field-mic-active");
}

function fieldFromTarget(target) {
  if (!(target instanceof Element)) return null;
  if (fieldTargets.has(target.id)) return target;
  const purpose = target.closest('[role="radiogroup"]');
  return purpose?.querySelector('[name="appointmentType"]') ? purpose : null;
}

function positionFieldMicrophone() {
  const viewport = window.visualViewport;
  const bottom = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
  fieldMicrophone.style.setProperty("--mic-bottom", `${bottom + 12}px`);
}
window.visualViewport?.addEventListener("resize", positionFieldMicrophone);
window.visualViewport?.addEventListener("scroll", positionFieldMicrophone);

function writeFieldSpeech(target, text) {
  const clean = text.trim().replace(/[.!?]+$/, "");
  if (target.matches('[role="radiogroup"]')) {
    if (!/^(call|telephone call|conference call|meeting)$/i.test(clean)) throw new Error("Say Call or Meeting.");
    setAppointmentType(parseAppointmentType(clean));
  } else if (target.id === "appointment-status") {
    if (!/^(open|completed)$/i.test(clean)) throw new Error("Say Open or Completed.");
    target.value = /^open$/i.test(clean) ? "Open" : "Completed";
  } else if (target.id === "mileage") {
    const value = parseMileage(clean);
    if (!value || /-|\b(?:minus|negative)\b/i.test(clean)) throw new Error("Say a mileage number, including zero.");
    target.value = value;
  } else if (target.type === "datetime-local") {
    const range = parseTimeRange(clean);
    const value = range ? (target === appointmentEndDatetime ? range.end : range.start) : /\d{4}/.test(clean) ? parseSpokenDateTime(clean) : "";
    if (!value) throw new Error("Say Now, Now minus three, or a full date and time including the year.");
    target.value = value;
    if (range && target === appointmentDatetime) appointmentEndDatetime.value = range.end;
  } else {
    const value = target.id === "additional-contacts" ? clean.replace(/\s*\bcomma\b\s*/gi, ", ") : /^(contact-name|appointment-subject)$/.test(target.id) ? clean : text.trim();
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    const insert = `${before && !/\s$/.test(before) ? " " : ""}${value}${after && !/^\s/.test(after) ? " " : ""}`;
    target.value = before + insert + after;
    target.setSelectionRange?.(before.length + insert.length, before.length + insert.length);
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  saveDraft(); showContactMatch();
}

function startFieldDictation(target) {
  if (fieldSession?.target === target) return;
  stopFieldDictation();
  const Recognition = getSpeechRecognition();
  if (!Recognition) { showToast("Field dictation is unavailable here. Use your keyboard microphone."); return; }
  const recognition = new Recognition();
  recognition.lang = "en-US"; recognition.continuous = true; recognition.interimResults = true;
  const label = target.matches('[role="radiogroup"]') ? "Purpose" : document.querySelector(`label[for="${target.id}"]`)?.textContent || "Field";
  const session = { recognition, target, startTimer: null, limitTimer: null, finalized: new Set(), preview: null };
  fieldSession = session;
  fieldMicrophone.hidden = false;
  document.body.classList.add("field-mic-active");
  fieldMicrophoneStatus.textContent = `Starting microphone: ${label}`;
  positionFieldMicrophone();
  recognition.onstart = () => {
    if (fieldSession !== session) return;
    clearTimeout(session.startTimer);
    fieldMicrophoneStatus.textContent = `Listening: ${label}`;
    setVoiceStatus(`Listening: ${label}`);
  };
  recognition.onresult = event => {
    if (fieldSession !== session) return;
    // Replace only the provisional insertion, leaving earlier final text intact.
    if (session.preview) {
      if (target.value !== session.preview.rendered) { stopFieldDictation("Entry edited. Tap the field to resume dictation."); return; }
      target.value = session.preview.value;
      target.setSelectionRange(session.preview.start, session.preview.end);
      session.preview = null;
    }
    let errorMessage = "";
    for (let i = 0; i < event.results.length; i++) {
      if (!event.results[i].isFinal || session.finalized.has(i)) continue;
      session.finalized.add(i);
      try { writeFieldSpeech(target, event.results[i][0].transcript); }
      catch (error) { errorMessage = error.message; }
    }
    const interim = Array.from(event.results).filter(result => !result.isFinal).map(result => result[0].transcript).join(" ").trim();
    if (interim && (target.type === "text" || target.tagName === "TEXTAREA")) {
      const preview = { value: target.value, start: target.selectionStart, end: target.selectionEnd };
      writeFieldSpeech(target, interim);
      preview.rendered = target.value;
      session.preview = preview;
    }
    fieldMicrophoneStatus.textContent = errorMessage || (interim ? `Hearing: ${interim}` : `Listening: ${label}`);
    saveDraft(); showContactMatch();
  };
  recognition.onerror = event => { if (fieldSession === session) { const message = event.error === "not-allowed" ? "Microphone permission denied. Your entry is unchanged." : `Microphone error: ${event.error}. Tap a field to try again.`; stopFieldDictation(message); showToast(message); } };
  recognition.onend = () => { if (fieldSession === session) stopFieldDictation("Microphone ended. Tap a field to listen again."); };
  session.startTimer = setTimeout(() => { if (fieldSession === session) stopFieldDictation("Microphone did not start. Tap a field to retry."); }, 10000);
  session.limitTimer = setTimeout(() => { if (fieldSession === session) stopFieldDictation("Five-minute listening limit reached. Your entry is kept."); }, 300000);
  try { recognition.start(); } catch { stopFieldDictation("Microphone could not start. Tap a field to retry."); }
}

fieldDictationToggle.addEventListener("change", () => {
  if (!fieldDictationToggle.checked) stopFieldDictation();
  try { localStorage.setItem("wpcrm-dictate-on-tap", String(fieldDictationToggle.checked)); } catch { showToast("Setting applies for this session only."); }
});
document.querySelector("#stop-field-microphone").addEventListener("click", () => stopFieldDictation());
document.addEventListener("pointerdown", event => {
  if (fieldSession && !fieldFromTarget(event.target) && !fieldMicrophone.contains(event.target)) stopFieldDictation();
}, true);
form.addEventListener("click", event => {
  if (!fieldDictationToggle.checked) return;
  const target = fieldFromTarget(event.target);
  if (target) startFieldDictation(target);
});
form.addEventListener("submit", () => stopFieldDictation(), true);
form.addEventListener("beforeinput", event => {
  if (event.isTrusted && fieldSession?.target === event.target) stopFieldDictation("Typing mode. Tap the field to resume dictation.");
}, true);
for (const id of ["reset-form", "check-update", "reload-app"]) document.querySelector(`#${id}`).addEventListener("click", () => stopFieldDictation(), true);
window.addEventListener("pagehide", () => stopFieldDictation());
document.addEventListener("visibilitychange", () => { if (document.hidden) stopFieldDictation(); });
