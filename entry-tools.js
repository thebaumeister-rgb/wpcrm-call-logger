const CONTACTS_KEY = "wpcrm-contact-directory-v1";
let directory = [];
const summaryField = document.querySelector("#spoken-summary");
const keyFor = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const contactLabel = (person) => [person.name, person.company, person.id].filter(Boolean).join(" | ");

function parseContacts(text, filename) {
  let rows;
  if (/\.json$/i.test(filename)) rows = JSON.parse(text);
  else if (/\.txt$/i.test(filename)) rows = text.split(/\r?\n/).filter(line => line.trim());
  else {
    const result = Papa.parse(text.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy" });
    if (result.errors.length) throw new Error("CSV could not be read. Check its headers and column counts.");
    rows = result.data;
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 20000) throw new Error("Expected 1 to 20,000 contacts.");
  const unique = new Map();
  for (const row of rows) {
    const fields = typeof row === "string" ? { name: row } : row;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("Invalid contact row.");
    const normalized = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ""), v]));
    const take = (...keys) => { const value = keys.map(k => normalized[k]).find(v => v != null && v !== ""); if (value != null && !["string", "number"].includes(typeof value)) throw new Error("Invalid contact value."); return String(value ?? "").trim(); };
    const name = take("contactname", "fullname", "name") || [take("firstname"), take("lastname")].filter(Boolean).join(" ");
    const person = { name, company: take("company", "companyname", "accountname"), id: take("contactid", "id") };
    if (!name || Object.values(person).some(v => v.length > 500 || /[\r\n|]/.test(v))) throw new Error("Each row needs a valid contact name. Supported headers: Contact Name, Company, Contact ID; or First Name and Last Name.");
    unique.set(keyFor(contactLabel(person)), person);
  }
  return [...unique.values()];
}

function matchesFor(name) {
  const exact = directory.filter(person => keyFor(contactLabel(person)) === keyFor(name));
  return exact.length ? exact : directory.filter(person => keyFor(person.name) === keyFor(name));
}

function showContactMatch() {
  const names = [contactName.value, ...additionalContacts.value.split(/\r?\n/)].filter(n => n.trim());
  document.querySelector("#contact-match").textContent = !directory.length ? "" : names.map(name => {
    const matches = matchesFor(name);
    return `${name}: ${matches.length === 1 ? "matched to imported list" : matches.length > 1 ? "multiple matches; select company / ID" : "not in imported list"}`;
  }).join(". ");
}

function renderDirectory() {
  const list = document.querySelector("#contact-options");
  list.replaceChildren();
  for (const person of directory) {
    const option = document.createElement("option");
    option.value = contactLabel(person);
    list.append(option);
  }
  document.querySelector("#contacts-status").textContent = directory.length ? `${directory.length} contacts imported on this device.` : "No contact list imported (optional).";
  showContactMatch();
}

function confirmContactRecords(records) {
  const resolved = [];
  for (const record of records) {
    const matches = matchesFor(record.contact_name);
    if (matches.length > 1) { showToast(`Multiple matches for ${record.contact_name}. Select the company and ID before saving.`); return null; }
    if (directory.length && !matches.length && !confirm(`${record.contact_name} is not in the imported contact list. Save as an unverified contact?`)) return null;
    const person = matches[0];
    const original = calls.find(item => item.id === record.id);
    const preserve = original && (original.contact_name === record.contact_name || [original.contact_name, original.contact_company, original.contact_id].filter(Boolean).join(" | ") === record.contact_name);
    resolved.push({ ...record, contact_name: person?.name || (preserve ? original.contact_name : record.contact_name),
      contact_id: person?.id || (preserve ? original.contact_id : ""),
      contact_company: person?.company || (preserve ? original.contact_company : "") });
  }
  const unique = new Map();
  for (const record of resolved) {
    const key = JSON.stringify([keyFor(record.contact_name), keyFor(record.contact_company), record.contact_id]);
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
}

document.querySelector("#import-contacts").onclick = () => document.querySelector("#contacts-file").click();
document.querySelector("#contacts-file").onchange = async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error("Contact file exceeds 10 MB.");
    const parsed = parseContacts(await file.text(), file.name);
    if (!confirm(`Import ${parsed.length} contacts${directory.length ? " and replace the existing list" : ""}?`)) return;
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(parsed));
    directory = parsed;
    renderDirectory();
  } catch (error) { showToast(`Contact import failed: ${error.message}`); }
  finally { event.target.value = ""; }
};
document.querySelector("#clear-contacts").onclick = () => {
  if (!confirm("Remove the optional contact list? Saved appointments will remain.")) return;
  try { localStorage.removeItem(CONTACTS_KEY); directory = []; renderDirectory(); }
  catch { showToast("Could not remove the contact list."); }
};
contactName.addEventListener("input", showContactMatch);
additionalContacts.addEventListener("input", showContactMatch);
try { const raw = localStorage.getItem(CONTACTS_KEY); if (raw) directory = parseContacts(raw, "contacts.json"); }
catch { showToast("Contact list could not be read. Reimport it; saved calls are unchanged."); }
renderDirectory();

function applySpokenSummary(text) {
  text = text.replace(/\bsave it[.!?\s]*$/i, "").trim();
  // Expand standalone guide answers only before notes, where they describe the appointment.
  const notesAt = text.search(/\b(?:appointment notes|notes)\s*:?\s+/i);
  const head = notesAt < 0 ? text : text.slice(0, notesAt);
  text = head.replace(/(^|[.!?;]\s*)(meeting|telephone call|conference call)(?=[.!?;]|$)/gi, "$1Type $2")
    .replace(/(^|[.!?;]\s*)now(?=[.!?;]|$)/gi, "$1Date now") + (notesAt < 0 ? "" : text.slice(notesAt));
  // Explicit spoken labels keep uncertain details out of CRM fields.
  const markers = [...text.matchAll(/(?:^|[.!?;]\s*|\s+)(additional contacts|contact names?|contacts?|appointment subject|subject|appointment type|type|date and time|date|mileage|appointment notes|notes|actions|to do items)\s*:?\s+/gi)];
  const found = {};
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const value = text.slice(marker.index + marker[0].length, markers[i + 1]?.index ?? text.length).trim().replace(/[.;]+$/, "");
    const key = marker[1].toLowerCase();
    if (/contact/.test(key)) found[/additional/.test(key) ? "additional" : "contact"] = value;
    else if (/subject/.test(key)) found.subject = value;
    else if (/type/.test(key)) found.type = parseAppointmentType(value);
    else if (/date/.test(key)) { found.date = /^(now|current|today)$/i.test(value) ? nowForInput() : parseSpokenDateTime(value); if (!found.date) throw new Error("Date not understood. Enter date and time manually."); }
    else if (/mileage/.test(key)) found.mileage = parseMileage(value);
    else if (/notes/.test(key)) found.notes = value;
    else found.actions = value;
  }
  if (found.contact) { const names = found.contact.split(/\s+and\s+|;/i); contactName.value = names.shift(); if (names.length) additionalContacts.value = names.join("\n"); }
  if (found.additional) additionalContacts.value = found.additional.split(/\s+and\s+|;/i).join("\n");
  if (found.subject) appointmentSubject.value = found.subject;
  if (found.type) setAppointmentType(found.type);
  if (found.date) appointmentDatetime.value = found.date;
  if (found.mileage != null) mileage.value = found.mileage;
  if (found.notes) appointmentNotes.value = found.notes;
  else if (!markers.length && text.trim()) appointmentNotes.value = text.trim();
  if (found.actions) document.querySelector("#actions").value = found.actions;
  saveDraft(); showContactMatch();
  return found;
}

async function completeDictation() {
  const text = await askOutLoud("Follow the guide on screen. Say contact name, appointment subject, meeting or telephone call, mileage, now or date and time, and appointment notes. Say save it when finished.", { collect: true, finishOnSave: true });
  summaryField.value = text;
  const found = applySpokenSummary(text);
  if (!contactName.value.trim()) contactName.value = await askOutLoud("Contact name?");
  if (!appointmentSubject.value.trim()) appointmentSubject.value = await askOutLoud("Appointment subject?");
  if (!found.type) {
    const type = parseAppointmentType(await askOutLoud("Was this a call or meeting?"));
    if (!type) throw new Error("Choose call or meeting before saving.");
    setAppointmentType(type);
  }
  if (new FormData(form).get("appointmentType") === "Decision-Maker Meeting" && !mileage.value) mileage.value = parseMileage(await askOutLoud("What was the mileage?"));
  if (!appointmentNotes.value.trim()) appointmentNotes.value = await askOutLoud("Appointment notes?", { collect: true });
  showContactMatch();
  saveDraft();
  showDictationReview();
  setVoiceStatus("Draft ready. Review the log and press Save call.");
  await speak("Your draft is ready for review. Press Save call when it is correct.");
}

function showDictationReview() {
  const review = document.querySelector("#dictation-review");
  review.hidden = false;
  updateDictationReview();
  review.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateDictationReview() {
  document.querySelector("#review-log").textContent = callToText(createCallFromForm()) + (additionalContacts.value.trim() ? `\nAdditional contacts:\n${additionalContacts.value}` : "");
}
form.addEventListener("input", updateDictationReview);
form.addEventListener("change", updateDictationReview);
document.querySelector("#dictate-details").onclick = () => {
  if (voiceActive) { stopVoiceEntry(); return; }
  const guide = document.querySelector("#dictation-guide");
  guide.hidden = false;
  guide.focus({ preventScroll: true });
  guide.scrollIntoView({ behavior: "smooth", block: "center" });
  runVoiceEntry("summary");
};
document.querySelector("#apply-summary").onclick = () => {
  try {
    applySpokenSummary(summaryField.value);
    showDictationReview();
    if (!form.reportValidity()) showToast("Complete the highlighted missing field.");
    else showToast("Fields filled. Review before saving.");
  } catch (error) { showToast(error.message); }
};
if (!getSpeechRecognition()) document.querySelector("#dictate-details").disabled = true;
