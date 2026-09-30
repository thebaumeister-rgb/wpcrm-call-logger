const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.TEST_URL || 'http://127.0.0.1:8081';
const passed = [];
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
async function saveForm(page) {
  await page.evaluate(() => {
    if (!appointmentDatetime.value) appointmentDatetime.value = nowForInput();
    if (!appointmentEndDatetime.value) appointmentEndDatetime.value = appointmentDatetime.value;
    if (!appointmentStatus.value) appointmentStatus.value = 'Completed';
    if (!mileage.value) mileage.value = '0';
    if (!new FormData(form).get('appointmentType')) setAppointmentType('Decision-Maker Conference Call');
  });
  await page.locator('#save-call').click();
}
(async () => {
  await fs.mkdir('proof', { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await check('Manual save, actions, reload persistence', async () => {
      await page.locator('#contact-name').fill('Sample Contact');
      await page.locator('#appointment-subject').fill('Review valve quotation');
      await page.locator('#appointment-notes').fill('Discussed delivery and pricing.');
      await page.locator('#actions').fill('Send the revised quotation tomorrow.');
      await saveForm(page);
      assert.equal(await page.locator('.call-card').count(), 1);
      await page.reload();
      assert.match(await page.locator('.call-card').innerText(), /revised quotation/);
    });
    await check('Edit preserves ID and replaces record', async () => {
      const id = await page.evaluate(() => JSON.parse(localStorage.getItem('wpcrm-sales-calls-v1'))[0].id);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.locator('#appointment-subject').fill('Updated quotation');
      await saveForm(page);
      assert.equal(await page.locator('.call-card').count(), 1);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wpcrm-sales-calls-v1'))[0].id), id);
    });
    await check('Fresh launch clears all entry fields and keeps saved calls', async () => {
      await page.locator('#contact-name').fill('Unfinished draft');
      await page.reload();
      assert.equal(await page.locator('#contact-name').inputValue(), '');
      assert.equal(await page.locator('#appointment-datetime').inputValue(), '');
      assert.equal(await page.locator('input[name="appointmentType"]:checked').count(), 0);
      assert.equal(await page.locator('[placeholder]').count(), 0);
      assert.equal(await page.locator('.call-card').count(), 1);
      await page.locator('#reset-form').click();
    });
    let exported;
    await check('Timestamped JSON exports preserve record data', async () => {
      const downloadEvent = page.waitForEvent('download');
      await page.locator('#export-json').click();
      const download = await downloadEvent;
      assert.match(download.suggestedFilename(), /^wpcrm-sales-calls-\d{4}(-\d{2}){5}-\d{3}\.json$/);
      exported = await fs.readFile(await download.path(), 'utf8');
      assert.equal(JSON.parse(exported)[0].appointment_subject, 'Updated quotation');
    });
    await check('Import skips duplicate IDs and rejects malformed records', async () => {
      await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('existing records skipped'));
      assert.equal(await page.locator('.call-card').count(), 1);
      await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('[{"contact_name": 42}]') });
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Import failed'));
      assert.equal(await page.locator('.call-card').count(), 1);
    });
    await check('Delete requires confirmation', async () => {
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: 'Delete saved call' }).click();
      assert.equal(await page.locator('.call-card').count(), 1);
    });
    await check('Offline navigation and saving', async () => {
      await context.setOffline(true);
      await page.goto(base + '/index.html?offline-proof=1');
      await page.locator('#contact-name').fill('Offline Sample');
      await page.locator('#appointment-subject').fill('Offline call');
      await page.locator('#appointment-notes').fill('Saved without network access.');
      await saveForm(page);
      assert.equal(await page.locator('.call-card').count(), 2);
      await context.setOffline(false);
    });
    await check('Mobile and desktop layout without horizontal overflow', async () => {
      await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (width !== 320) await page.screenshot({ path: `proof/${width === 390 ? 'phone' : 'desktop'}.png`, fullPage: true });
      }
    });
    await check('Negative voice confirmation and mileage parsing', async () => {
      assert.equal(await page.evaluate(() => isYes("don't save")), false);
      assert.equal(await page.evaluate(() => isYes('yes')), true);
      assert.equal(await page.evaluate(() => parseMileage('one hundred forty six')), '146');
      assert.equal(await page.evaluate(() => parseMileage('zero')), '0');
    });
    await check('Multiple contacts: draft, confirmation, unique exports, mileage and independent edits', async () => {
      const multi = await browser.newPage();
      await multi.goto(base);
      await multi.locator('#contact-name').fill('First Person');
      await multi.locator('#additional-contacts').fill('Second Person\nfirst person\n\nThird Person');
      await multi.locator('#appointment-subject').fill('Shared meeting');
      await multi.locator('#appointment-notes').fill('Identical discussion');
      await multi.locator('#actions').fill('Follow up');
      await multi.evaluate(() => setAppointmentType('Decision-Maker Meeting'));
      await multi.locator('#mileage').fill('20');
      assert.match(await multi.evaluate(() => localStorage.getItem('wpcrm-call-draft-v1')), /Third Person/);
      multi.once('dialog', dialog => dialog.dismiss());
      await saveForm(multi);
      assert.equal(await multi.locator('.call-card').count(), 0);
      multi.once('dialog', dialog => dialog.accept());
      await saveForm(multi);
      const rows = await multi.evaluate(() => JSON.parse(getJsonExport()));
      assert.equal(rows.length, 3);
      assert.equal(new Set(rows.map(row => row.id)).size, 3);
      assert.equal(new Set(rows.map(row => row.meeting_group_id)).size, 1);
      assert.equal(rows.reduce((sum, row) => sum + Number(row.mileage), 0), 20);
      assert.ok(rows.every(row => row.appointment_notes === 'Identical discussion' && row.actions === 'Follow up'));
      await multi.getByRole('button', { name: 'Edit', exact: true }).first().click();
      assert.equal(await multi.locator('#additional-contacts-field').isHidden(), true);
      await multi.locator('#appointment-notes').fill('Individual correction');
      await saveForm(multi);
      assert.equal(await multi.locator('.call-card').count(), 3);
      await multi.reload();
      const restored = await multi.evaluate(() => JSON.parse(getJsonExport()));
      assert.equal(restored[0].meeting_group_id, rows[0].meeting_group_id);
      assert.equal(restored.filter(row => row.appointment_notes === 'Individual correction').length, 1);
      await multi.close();
    });
    await check('Contact CSV import, persistence, matching, ambiguous names and export IDs', async () => {
      const p = await browser.newPage();
      await p.goto(base);
      p.once('dialog', dialog => dialog.accept());
      await p.locator('#contacts-file').setInputFiles({ name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from('Contact Name,Company,Contact ID\n"Robert Connor","Acme, Inc",42\nAlex Smith,One,43\nAlex Smith,Two,44') });
      await p.waitForFunction(() => document.querySelector('#contacts-status').textContent.includes('3 contacts'));
      await p.reload();
      assert.match(await p.locator('#contacts-status').textContent(), /3 contacts/);
      await p.locator('#contact-name').fill('Alex Smith');
      await p.locator('#appointment-subject').fill('Quote');
      await p.locator('#appointment-notes').fill('Test');
      await saveForm(p);
      assert.equal(await p.locator('.call-card').count(), 0);
      await p.locator('#contact-name').fill('Robert Connor');
      assert.match(await p.locator('#contact-match').textContent(), /matched to imported list/);
      await saveForm(p);
      const record = await p.evaluate(() => JSON.parse(getJsonExport())[0]);
      assert.equal(record.contact_id, '42');
      assert.equal(record.contact_company, 'Acme, Inc');
      await p.getByRole('button', { name: 'Edit', exact: true }).click();
      await p.locator('#appointment-notes').fill('Edited');
      await saveForm(p);
      assert.equal(await p.evaluate(() => JSON.parse(getJsonExport())[0].contact_id), '42');
      await p.locator('#contacts-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Unknown\nNobody') });
      await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Contact import failed'));
      assert.match(await p.locator('#contacts-status').textContent(), /3 contacts/);
      await p.locator('#contact-name').fill('Unverified Name');
      await p.locator('#appointment-subject').fill('New quote');
      await p.locator('#appointment-notes').fill('Do not save');
      p.once('dialog', dialog => dialog.dismiss());
      await saveForm(p);
      assert.equal(await p.locator('.call-card').count(), 1);
      await p.close();
    });
    await check('Share permission denial downloads intact JSON; cancellation does not download', async () => {
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); } });
      });
      const before = await page.evaluate(() => getJsonExport());
      const downloadEvent = page.waitForEvent('download');
      await page.locator('#share-json').click();
      const download = await downloadEvent;
      assert.deepEqual(JSON.parse(await fs.readFile(await download.path(), 'utf8')), JSON.parse(before));
      assert.equal(await page.locator('#share-status').isVisible(), true);
      assert.equal(await page.evaluate(() => getJsonExport()), before);
      await page.evaluate(async () => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Canceled', 'AbortError'); } });
        const original = downloadFile;
        downloadFile = () => { throw new Error('Unexpected download on cancellation'); };
        try { await shareJsonExport(); } finally { downloadFile = original; }
      });
      assert.equal(await page.locator('#share-status').isHidden(), true);
      await page.reload();
    });
    await check('Storage write failure preserves form and saved calls', async () => {
      await page.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('Quota exceeded'); }; });
      await page.locator('#contact-name').fill('Must not disappear');
      await page.locator('#appointment-subject').fill('Unsaved');
      await page.locator('#appointment-notes').fill('Keep this draft');
      await saveForm(page);
      assert.equal(await page.locator('#contact-name').inputValue(), 'Must not disappear');
      assert.equal(await page.locator('.call-card').count(), 2);
      await page.reload();
    });
    await check('Corrupt storage remains untouched and blocks writes', async () => {
      await page.evaluate(() => localStorage.setItem('wpcrm-sales-calls-v1', '{broken'));
      await page.reload();
      assert.equal(await page.locator('#storage-warning').isVisible(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem('wpcrm-sales-calls-v1')), '{broken');
    });
    await context.close();
    await check('Update button verifies server version, preserves canceled entry and reloads on approval', async () => {
      const ctx = await browser.newContext({ serviceWorkers: 'block' });
      const p = await ctx.newPage(); await p.goto(base);
      await p.locator('#check-update').click();
      await p.waitForFunction(() => document.querySelector('#update-status').textContent.includes('is up to date'));
      await p.locator('#contact-name').fill('Saved update test');
      await p.locator('#appointment-subject').fill('Saved record');
      await p.locator('#appointment-notes').fill('Must survive reload');
      await saveForm(p);
      const saved = await p.evaluate(() => getJsonExport());
      await p.locator('#contact-name').fill('Unfinished entry');
      const html = await (await ctx.request.get(base + '/index.html')).text();
      const future = html.replace('name="app-version" content="26"', 'name="app-version" content="27"').replace('Version 26', 'Version 27');
      await p.route('**/index.html?update-check=*', route => route.fulfill({ contentType: 'text/html', body: future }));
      let warning = '';
      p.once('dialog', dialog => { warning = dialog.message(); return dialog.dismiss(); });
      await p.locator('#check-update').click();
      await p.waitForFunction(() => !document.querySelector('#check-update').disabled);
      assert.match(warning, /unfinished entry will be cleared/);
      assert.equal(await p.locator('#contact-name').inputValue(), 'Unfinished entry');
      assert.equal(await p.locator('#reload-app').isVisible(), true);
      await p.route('**/index.html?v=27&reload=*', route => route.fulfill({ contentType: 'text/html', body: future }));
      p.once('dialog', dialog => dialog.accept());
      await p.locator('#reload-app').click();
      await p.waitForURL('**/index.html?v=27&reload=*');
      assert.equal(await p.locator('#contact-name').inputValue(), '');
      assert.deepEqual(await p.evaluate(() => JSON.parse(getJsonExport())), JSON.parse(saved));
      await p.unroute('**/index.html?update-check=*');
      await ctx.setOffline(true);
      await p.locator('#check-update').click();
      await p.waitForFunction(() => document.querySelector('#update-status').textContent.includes('offline'));
      await ctx.setOffline(false);
      await p.route('**/index.html?update-check=*', route => route.fulfill({ status: 500, body: 'error' }));
      await p.locator('#check-update').click();
      await p.waitForFunction(() => document.querySelector('#update-status').textContent.includes('Could not check'));
      assert.equal(await p.locator('#check-update').isEnabled(), true);
      await ctx.close();
    });
    await check('Field-tap microphone, floating Stop, switching, late results and typing mode', async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript(() => {
        window.recognizers = [];
        window.SpeechRecognition = class {
          start() { window.recognizers.push(this); queueMicrotask(() => this.onstart?.()); }
          abort() { this.aborted = true; }
        };
      });
      const p = await ctx.newPage(); await p.goto(base);
      assert.equal(await p.locator('#spoken-summary, #dictation-guide, #dictate-details, #start-voice').count(), 0);
      assert.equal(await p.locator('#dictate-on-tap').isChecked(), true);
      await p.locator('#contact-name').click();
      await p.waitForFunction(() => document.querySelector('#field-microphone-status').textContent.startsWith('Listening'));
      await p.evaluate(() => {
        const result = [{ transcript: 'Robert Connor' }]; result.isFinal = true;
        window.lateResult = window.recognizers[0].onresult;
        window.recognizers[0].onresult({ resultIndex: 0, results: [result] });
      });
      assert.equal(await p.locator('#contact-name').inputValue(), 'Robert Connor');
      await p.locator('#appointment-notes').click();
      assert.equal(await p.evaluate(() => window.recognizers[0].aborted), true);
      await p.evaluate(() => {
        const result = [{ transcript: 'Discussed pricing.' }]; result.isFinal = true;
        window.lateResult({ resultIndex: 0, results: [result] });
        window.recognizers.at(-1).onresult({ resultIndex: 0, results: [result] });
      });
      assert.equal(await p.locator('#contact-name').inputValue(), 'Robert Connor');
      assert.equal(await p.locator('#appointment-notes').inputValue(), 'Discussed pricing.');
      const box = await p.locator('#field-microphone').boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
      await p.screenshot({ path: 'proof/field-dictation-phone.png' });
      await p.locator('#stop-field-microphone').click();
      assert.equal(await p.locator('#field-microphone').isHidden(), true);
      assert.equal(await p.locator('.call-card').count(), 0);
      await p.locator('#appointment-subject').click();
      assert.equal(await p.locator('#field-microphone').isVisible(), true);
      await p.locator('#dictate-on-tap').uncheck();
      await p.locator('#appointment-subject').click();
      assert.equal(await p.locator('#field-microphone').isHidden(), true);
      await p.locator('#appointment-subject').fill('Typed quotation');
      await saveForm(p);
      assert.equal(await p.locator('.call-card').count(), 1);
      assert.equal(await p.locator('#dictate-on-tap').isChecked(), false);
      await p.reload();
      assert.equal(await p.locator('#dictate-on-tap').isChecked(), false);
      await ctx.close();
    });
    await check('Typed field speech values, time ranges, status, purpose and invalid values', async () => {
      const p = await browser.newPage(); await p.goto(base);
      const values = await p.evaluate(() => {
        writeFieldSpeech(appointmentDatetime, 'Now minus three');
        writeFieldSpeech(appointmentStatus, 'Open');
        writeFieldSpeech(document.querySelector('[role="radiogroup"]'), 'Meeting');
        writeFieldSpeech(mileage, 'zero');
        writeFieldSpeech(additionalContacts, 'Paul Buck comma Jane Smith');
        let rejected = false;
        try { writeFieldSpeech(appointmentStatus, 'perhaps'); } catch { rejected = true; }
        return { start: appointmentDatetime.value, end: appointmentEndDatetime.value, status: appointmentStatus.value, mileage: mileage.value, additional: additionalContacts.value, type: new FormData(form).get('appointmentType'), rejected };
      });
      assert.equal((new Date(values.end) - new Date(values.start)) / 3600000, 3);
      assert.equal(values.status, 'Open'); assert.equal(values.mileage, '0');
      assert.equal(values.type, 'Decision-Maker Meeting');
      assert.equal(values.additional, 'Paul Buck, Jane Smith'); assert.equal(values.rejected, true);
      await p.close();
    });
    await check('Field microphone stops during startup and on permission error', async () => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => { window.SpeechRecognition = class { start() { window.testRecognition = this; } abort() {} }; });
      const p = await ctx.newPage(); await p.goto(base);
      await p.locator('#contact-name').click();
      await p.locator('#stop-field-microphone').click();
      assert.equal(await p.evaluate(() => fieldSession), null);
      await p.locator('#contact-name').click();
      await p.evaluate(() => window.testRecognition.onerror({ error: 'not-allowed' }));
      assert.equal(await p.locator('#field-microphone').isHidden(), true);
      assert.match(await p.locator('#voice-status').textContent(), /permission denied/);
      assert.equal(await p.locator('#contact-name').inputValue(), '');
      await ctx.close();
    });
    await check('Interim speech appears immediately, corrects without duplication and survives Stop', async () => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => { window.SpeechRecognition = class { start() { window.liveRecognition = this; queueMicrotask(() => this.onstart?.()); } abort() {} }; });
      const p = await ctx.newPage(); await p.goto(base);
      await p.locator('#contact-name').click();
      assert.equal(await p.evaluate(() => liveRecognition.interimResults), true);
      const emit = async rows => p.evaluate(rows => {
        const results = rows.map(([text, final]) => { const result = [{ transcript: text }]; result.isFinal = final; return result; });
        liveRecognition.onresult({ resultIndex: 0, results });
      }, rows);
      await emit([['Robert', false]]);
      assert.equal(await p.locator('#contact-name').inputValue(), 'Robert');
      await emit([['Robert Conner', false]]);
      assert.equal(await p.locator('#contact-name').inputValue(), 'Robert Conner');
      await emit([['Robert Connor', true]]);
      await emit([['Robert Connor', true]]);
      assert.equal(await p.locator('#contact-name').inputValue(), 'Robert Connor');
      await p.locator('#appointment-notes').click();
      await emit([['Reviewed', true], ['the price', false]]);
      await emit([['Reviewed', true], ['the pricing', true], ['and delivery', false]]);
      assert.equal(await p.locator('#appointment-notes').inputValue(), 'Reviewed the pricing and delivery');
      await p.locator('#stop-field-microphone').click();
      assert.equal(await p.locator('#appointment-notes').inputValue(), 'Reviewed the pricing and delivery');
      await p.locator('#mileage').click();
      await emit([['twenty', false]]);
      assert.equal(await p.locator('#mileage').inputValue(), '');
      assert.match(await p.locator('#field-microphone-status').textContent(), /twenty/);
      await emit([['twenty', true]]);
      assert.equal(await p.locator('#mileage').inputValue(), '20');
      await ctx.close();
    });
    assert.deepEqual(errors, []);
    await fs.writeFile('proof/test-results.json', JSON.stringify({ testedAt: new Date().toISOString(), browser: browser.version(), passed, limitations: ['Real phone microphone and native share sheet require on-device acceptance testing.', 'No live WPCRM entries or real customer records were used.'] }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
