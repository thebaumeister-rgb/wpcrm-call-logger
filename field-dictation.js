const fieldDictationToggle = document.querySelector("#dictate-on-tap");
const fieldMicrophone = document.querySelector("#field-microphone");
const fieldMicrophoneStatus = document.querySelector("#field-microphone-status");
const fieldTargets = new Set(["contact-name", "additional-contacts", "appointment-subject", "appointment-datetime", "appointment-end-datetime", "appointment-status", "mileage", "appointment-notes", "actions"]);
let fieldSession = null;

try { fieldDictationToggle.checked = localStorage.getItem("wpcrm-dictate-on-tap") !== "false"; } catch { /* Optional preference. */ }
if (!getSpeechRecognition()) { fieldDictationToggle.checked = false; fieldDictationToggle.disabled = true; }

function stopFieldDictation(message = "Microphone stopped. Your entry is kept.") {
  const session = fieldSession;
  fieldSession = null;
  if (session) {
    clearTimeout(session.startTimer); clearTimeout(session.restartTimer);
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

function combineSpeechParts(parts, contactNameField) {
  return parts.filter(Boolean).reduce((combined, part) => {
    const value = part.trim();
    if (!combined) return value;
    // Android can replay cumulative text at a new result index or after a restart.
    // Match only the adjoining boundary, never remove repetition inside an utterance.
    const words = text => Array.from(text.matchAll(/\S+/g), match => ({
      key: match[0].toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""),
      end: match.index + match[0].length
    }));
    const previous = words(combined), incoming = words(value);
    const minimum = contactNameField ? 1 : 2;
    for (let size = Math.min(previous.length, incoming.length); size >= minimum; size--) {
      if (incoming.slice(0, size).every((word, index) => word.key && word.key === previous[previous.length - size + index].key)) {
        const remainder = value.slice(incoming[size - 1].end).trim();
        return remainder ? combined + " " + remainder : combined;
      }
    }
    // A replay can first arrive as a shorter interim prefix of the previous text.
    if (incoming.length >= minimum && incoming.length < previous.length &&
        incoming.every((word, index) => word.key && word.key === previous[index].key)) return combined;
    return combined ? combined + " " + value : value;
  }, "");
}

function startFieldDictation(target) {
  if (fieldSession?.target === target) return;
  stopFieldDictation();
  const Recognition = getSpeechRecognition();
  if (!Recognition) { showToast("Field dictation is unavailable here. Use your keyboard microphone."); return; }
  const label = target.matches('[role="radiogroup"]') ? "Purpose" : document.querySelector(`label[for="${target.id}"]`)?.textContent || "Field";
  const isText = target.type === "text" || target.tagName === "TEXTAREA";
  const session = { recognition: null, target, startTimer: null, restartTimer: null, runs: [],
    original: isText ? target.value : "", start: target.selectionStart, end: target.selectionEnd,
    rendered: isText ? target.value : "", emptyRestarts: 0 };
  fieldSession = session;
  fieldMicrophone.hidden = false;
  document.body.classList.add("field-mic-active");
  positionFieldMicrophone();

  function beginListening() {
    if (fieldSession !== session || document.hidden) return;
    const recognition = new Recognition();
    const run = { text: "" };
    session.runs.push(run);
    session.recognition = recognition;
    recognition.lang = "en-US"; recognition.continuous = true; recognition.interimResults = true;
    let runOpen = true;
    const current = () => runOpen && fieldSession === session && session.recognition === recognition;
    fieldMicrophoneStatus.textContent = `Starting microphone: ${label}`;
    recognition.onstart = () => {
      if (!current()) return;
      clearTimeout(session.startTimer);
      fieldMicrophoneStatus.textContent = `Listening: ${label}`;
      setVoiceStatus(`Listening: ${label}`);
    };
    recognition.onresult = event => {
      if (!current()) return;
      if (isText && target.value !== session.rendered) { stopFieldDictation("Entry edited. Tap the field to resume dictation."); return; }
      session.emptyRestarts = 0;
      const results = Array.from(event.results);
      const nameField = target.id === "contact-name";
      const combine = recognition.offline ? parts => parts.filter(Boolean).join(" ") : parts => combineSpeechParts(parts, nameField);
      run.text = combine(results.map(result => result[0].transcript.trim()));
      const interim = results.filter(result => !result.isFinal).map(result => result[0].transcript).join(" ").trim();
      let errorMessage = "";
      if (isText) {
        // Rebuild this session's insertion from the recognition snapshot, never append a preview twice.
        target.value = session.original;
        target.setSelectionRange(session.start, session.end);
        const text = combine(session.runs.map(item => item.text));
        if (text) writeFieldSpeech(target, text);
        session.rendered = target.value;
      } else {
        const finalized = results.filter(result => result.isFinal);
        const finalText = recognition.offline ? results.slice(event.resultIndex).filter(result => result.isFinal).at(-1)?.[0].transcript.trim() : combineSpeechParts(finalized.map(result => result[0].transcript.trim()), false);
        if (finalText) {
          try { writeFieldSpeech(target, finalText); }
          catch (error) { errorMessage = error.message; }
        }
      }
      fieldMicrophoneStatus.textContent = errorMessage || (interim ? `Hearing: ${interim}` : `Listening: ${label}`);
      saveDraft(); showContactMatch();
    };
    recognition.onerror = event => {
      if (!current()) return;
      if (event.error === "no-speech") {
        fieldMicrophoneStatus.textContent = `Still listening: ${label}`;
        return; // Android often ends recognition after silence; onend resumes it.
      }
      const message = event.error === "not-allowed" ? "Microphone permission denied. Your entry is kept." : `Microphone error: ${event.error}. Tap a field to try again.`;
      stopFieldDictation(message); showToast(message);
    };
    recognition.onend = () => {
      if (!current()) return;
      if (recognition.offline) {
        stopFieldDictation(recognition.finishing ? "Microphone stopped. Your entry is kept." : "Microphone interrupted. Tap a field to resume.");
        return;
      }
      runOpen = false;
      clearTimeout(session.startTimer);
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      if (!run.text) session.runs.pop();
      const delay = run.text ? 200 : Math.min(3000, 300 * ++session.emptyRestarts);
      fieldMicrophoneStatus.textContent = `Resuming microphone: ${label}`;
      session.restartTimer = setTimeout(beginListening, delay);
    };
    session.startTimer = setTimeout(() => { if (current()) stopFieldDictation("Microphone did not start. Tap a field to retry."); }, 10000);
    try { recognition.start(); } catch { stopFieldDictation("Microphone could not start. Tap a field to retry."); }
  }
  beginListening();
}

fieldDictationToggle.addEventListener("change", () => {
  if (!fieldDictationToggle.checked) stopFieldDictation();
  try { localStorage.setItem("wpcrm-dictate-on-tap", String(fieldDictationToggle.checked)); } catch { showToast("Setting applies for this session only."); }
});
document.querySelector("#stop-field-microphone").addEventListener("click", () => {
  if (fieldSession?.recognition.finish) {
    fieldMicrophoneStatus.textContent = "Finishing last words...";
    fieldSession.recognition.finish();
  } else stopFieldDictation();
});
document.addEventListener("pointerdown", event => {
  if (fieldSession && event.target.closest("button, a") && !fieldFromTarget(event.target) && !fieldMicrophone.contains(event.target)) stopFieldDictation();
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
