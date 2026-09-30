const CONTACTS_KEY = "wpcrm-contact-directory-v1";
let directory = [];
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
  const names = [contactName.value, ...splitAdditionalContacts(additionalContacts.value)].filter(n => n.trim());
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

function localTimeValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function parseTimeRange(value, now = new Date()) {
  const relative = value.match(/^now(?:\s*(?:-|minus)\s*(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*hours?)?)?$/i);
  if (relative) {
    const hours = relative[1] ? Number(parseMileage(relative[1])) : 0;
    if (!Number.isFinite(hours) || hours > 8760) return null;
    return { start: localTimeValue(new Date(now.getTime() - hours * 3600000)), end: localTimeValue(now) };
  }
  const range = value.replace(/^start\s*:?\s*/i, "").split(/\s+(?:end\s*:?|to|until|through)\s*/i);
  if (range.length !== 2) return null;
  // Require dates on both ends rather than silently assigning today's date.
  if (!range.every(part => /\d{4}/.test(part) && /\d\s*(?::\d{2}|a\.?m\.?|p\.?m\.?)/i.test(part))) return null;
  const parse = part => parseSpokenDateTime(part.replace(/\bat\b/gi, " ").replace(/\b([ap])\.?m\.?/gi, "$1m").replace(/\b(\d{1,2})\s+(am|pm)\b/gi, "$1:00 $2").trim());
  const start = parse(range[0]);
  const end = parse(range[1]);
  return start && end && new Date(end) >= new Date(start) ? { start, end } : null;
}
