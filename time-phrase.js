function interpretTimePhrase(value, now = new Date()) {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5 };
  const text = value.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|half)\b/g, word => words[word]).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  const length = text.match(/(?:for|(?:meeting )?(?:length|duration) (?:is|of))\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/);
  const duration = length ? +length[1] * (/^h/.test(length[2]) ? 3600000 : 60000) : null;
  if (duration !== null && (duration <= 0 || duration > 7 * 86400000)) return null;
  const base = text.replace(length?.[0] || /$^/, '').replace(/[,.;]+/g, ' ').trim();
  let start, end;
  if (base === 'now') { end = new Date(now); start = new Date(now.getTime() - (duration || 0)); }
  else {
    const ago = base.match(/^(?:now\s*(?:minus|-)?\s*)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\s*(?:ago)?$/);
    const day = base.match(/^(today|yesterday|last (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\s+at\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/);
    if (ago) start = new Date(now.getTime() - +ago[1] * (/^h/.test(ago[2]) ? 3600000 : 60000));
    else if (day && +day[2] >= 1 && +day[2] <= 12 && +(day[3] || 0) < 60) {
      start = new Date(now); if (day[1] === 'yesterday') start.setDate(start.getDate() - 1);
      if (day[1].startsWith('last ')) {
        const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day[1].slice(5));
        // "Last" always means a previous calendar day, including seven days back on the same weekday.
        const daysBack = (start.getDay() - weekday + 7) % 7 || 7;
        start.setDate(start.getDate() - daysBack);
      }
      start.setHours(+day[2] % 12 + (day[4] === 'p' ? 12 : 0), +(day[3] || 0), 0, 0);
    } else {
      start = parseCalendarPhrase(base, now);
      if (!start) return null;
    }
    end = duration !== null ? new Date(start.getTime() + duration) : ago ? new Date(now) : new Date(start);
  }
  if (!Number.isFinite(start.getTime()) || end < start) return null;
  const local = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return { start: local(start), end: local(end) };
}

function parseCalendarPhrase(value, now) {
  let text = value.replace(/^on\s+/, '').replace(/\bnoon\b/g, '12 pm').replace(/\bmidnight\b/g, '12 am');
  const clock = text.match(/(?:\s+at\s+|\s+)(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/);
  const military = !clock && text.match(/(?:\s+at\s+|\s+)(\d{1,2}):(\d{2})$/);
  const time = clock || military;
  if (!time) return null;
  let hour = +time[1], minute = +(time[2] || 0);
  if (minute > 59 || (clock ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (clock) hour = hour % 12 + (clock[3] === 'p' ? 12 : 0);
  text = text.slice(0, time.index).trim();
  const date = new Date(now);
  const relative = { today: 0, yesterday: -1, tomorrow: 1, 'day before yesterday': -2, 'day after tomorrow': 2 };
  const days = text.match(/^(\d+) days? ago$/);
  const weekday = text.match(/^(?:(last|next|this) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (text in relative) date.setDate(date.getDate() + relative[text]);
  else if (days) date.setDate(date.getDate() - +days[1]);
  else if (weekday) {
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday[2]);
    let delta = target - date.getDay();
    if (weekday[1] === 'last') delta = -((date.getDay() - target + 7) % 7 || 7);
    else if (weekday[1] === 'next') delta = (target - date.getDay() + 7) % 7 || 7;
    else if (!weekday[1] && delta > 0) delta -= 7;
    date.setDate(date.getDate() + delta);
  } else {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const named = text.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
    const reversed = text.match(/^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/);
    const numeric = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let year = now.getFullYear(), month, day;
    if (named || reversed) {
      const match = named || reversed;
      const name = named ? match[1] : match[2];
      month = months.findIndex(m => m === name || (name.length === 3 && m.startsWith(name)));
      day = +(named ? match[2] : match[1]); year = +(match[3] || year);
    } else if (numeric) { month = +numeric[1] - 1; day = +numeric[2]; year = +(numeric[3] || year); }
    else if (iso) { year = +iso[1]; month = +iso[2] - 1; day = +iso[3]; }
    else return null;
    if (month < 0 || month > 11 || day < 1 || day > 31 || year < 1900 || year > 9999) return null;
    date.setFullYear(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  }
  date.setHours(hour, minute, 0, 0);
  if (date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date;
}
if (typeof module !== 'undefined') module.exports = { interpretTimePhrase };
if (typeof document !== 'undefined') {
  const input = document.querySelector('#time-phrase');
  const apply = () => {
    if (!input.value.trim()) return false;
    const range = interpretTimePhrase(input.value);
    const status = document.querySelector('#time-phrase-status');
    if (!range) { status.textContent = 'Time not recognized. Include am or pm for a clock time, or edit Start and End manually.'; return false; }
    document.querySelector('#appointment-datetime').value = range.start;
    document.querySelector('#appointment-end-datetime').value = range.end;
    status.textContent = `Start: ${range.start.replace('T', ' ')}. End: ${range.end.replace('T', ' ')}. Review before saving.`;
    return true;
  };
  input.addEventListener('change', apply);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (apply()) {
        const start = document.querySelector('#appointment-datetime');
        start.focus();
        start.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  });
  document.querySelector('#call-form').addEventListener('reset', () => { input.value = ''; document.querySelector('#time-phrase-status').textContent = ''; });
}
