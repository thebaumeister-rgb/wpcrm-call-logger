const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.TEST_URL || 'http://127.0.0.1:8081';
const passed = [];
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
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
      await page.locator('#save-call').click();
      assert.equal(await page.locator('.call-card').count(), 1);
      await page.reload();
      assert.match(await page.locator('.call-card').innerText(), /revised quotation/);
    });
    await check('Edit preserves ID and replaces record', async () => {
      const id = await page.evaluate(() => JSON.parse(localStorage.getItem('wpcrm-sales-calls-v1'))[0].id);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.locator('#appointment-subject').fill('Updated quotation');
      await page.locator('#save-call').click();
      assert.equal(await page.locator('.call-card').count(), 1);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wpcrm-sales-calls-v1'))[0].id), id);
    });
    await check('Draft recovery after reload', async () => {
      await page.locator('#contact-name').fill('Unfinished draft');
      await page.reload();
      assert.equal(await page.locator('#contact-name').inputValue(), 'Unfinished draft');
      page.once('dialog', dialog => dialog.accept());
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
      await page.locator('#save-call').click();
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
      await multi.reload();
      assert.match(await multi.locator('#additional-contacts').inputValue(), /Third Person/);
      multi.once('dialog', dialog => dialog.dismiss());
      await multi.locator('#save-call').click();
      assert.equal(await multi.locator('.call-card').count(), 0);
      multi.once('dialog', dialog => dialog.accept());
      await multi.locator('#save-call').click();
      const rows = await multi.evaluate(() => JSON.parse(getJsonExport()));
      assert.equal(rows.length, 3);
      assert.equal(new Set(rows.map(row => row.id)).size, 3);
      assert.equal(new Set(rows.map(row => row.meeting_group_id)).size, 1);
      assert.equal(rows.reduce((sum, row) => sum + Number(row.mileage), 0), 20);
      assert.ok(rows.every(row => row.appointment_notes === 'Identical discussion' && row.actions === 'Follow up'));
      await multi.getByRole('button', { name: 'Edit', exact: true }).first().click();
      assert.equal(await multi.locator('#additional-contacts-field').isHidden(), true);
      await multi.locator('#appointment-notes').fill('Individual correction');
      await multi.locator('#save-call').click();
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
      await p.locator('#save-call').click();
      assert.equal(await p.locator('.call-card').count(), 0);
      await p.locator('#contact-name').fill('Robert Connor');
      assert.match(await p.locator('#contact-match').textContent(), /matched to imported list/);
      await p.locator('#save-call').click();
      const record = await p.evaluate(() => JSON.parse(getJsonExport())[0]);
      assert.equal(record.contact_id, '42');
      assert.equal(record.contact_company, 'Acme, Inc');
      await p.getByRole('button', { name: 'Edit', exact: true }).click();
      await p.locator('#appointment-notes').fill('Edited');
      await p.locator('#save-call').click();
      assert.equal(await p.evaluate(() => JSON.parse(getJsonExport())[0].contact_id), '42');
      await p.locator('#contacts-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Unknown\nNobody') });
      await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Contact import failed'));
      assert.match(await p.locator('#contacts-status').textContent(), /3 contacts/);
      await p.locator('#contact-name').fill('Unverified Name');
      await p.locator('#appointment-subject').fill('New quote');
      await p.locator('#appointment-notes').fill('Do not save');
      p.once('dialog', dialog => dialog.dismiss());
      await p.locator('#save-call').click();
      assert.equal(await p.locator('.call-card').count(), 1);
      await p.close();
    });
    await check('Summary fills fields; missing-detail prompts and confirmation use mocked speech', async () => {
      const p = await browser.newPage();
      await p.goto(base);
      await p.locator('#spoken-summary').fill('Contact Robert Connor. Subject RV16 quote. Type meeting. Mileage 20. Notes Discussed pricing. Actions Send quote.');
      await p.locator('#apply-summary').click();
      assert.equal(await p.locator('#contact-name').inputValue(), 'Robert Connor');
      assert.equal(await p.locator('#appointment-subject').inputValue(), 'RV16 quote');
      assert.equal(await p.locator('#mileage').inputValue(), '20');
      assert.equal(await p.locator('#actions').inputValue(), 'Send quote');
      const prompts = await p.evaluate(async () => {
        resetForm();
        const prompts = [];
        const answers = ['Notes Discussed pricing.', 'Robert Connor', 'RV16 quote', 'call', 'yes'];
        askOutLoud = async question => { prompts.push(question); if (!answers.length) throw new Error('Unexpected question'); return answers.shift(); };
        speak = async () => {};
        await completeDictation();
        return prompts;
      });
      assert.equal(prompts.length, 5);
      assert.equal(prompts.some(prompt => prompt === 'Appointment notes?'), false);
      assert.equal(await p.locator('.call-card').count(), 1);
      assert.equal(await p.evaluate(() => JSON.parse(getJsonExport())[0].appointment_notes), 'Discussed pricing');
      await p.close();
    });
    await check('Storage write failure preserves form and saved calls', async () => {
      await page.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('Quota exceeded'); }; });
      await page.locator('#contact-name').fill('Must not disappear');
      await page.locator('#appointment-subject').fill('Unsaved');
      await page.locator('#appointment-notes').fill('Keep this draft');
      await page.locator('#save-call').click();
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
    await check('Voice Stop releases stalled startup and spoken prompt', async () => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => {
        window.SpeechRecognition = class { start() {} abort() {} };
      });
      const p = await ctx.newPage();
      await p.goto(base);
      await p.locator('#start-voice').click();
      await p.locator('#start-voice').click();
      await p.waitForFunction(() => document.querySelector('#start-voice').textContent === 'Start voice');
      await p.evaluate(() => {
        window.SpeechRecognition = class { start() { setTimeout(() => this.onstart?.(), 0); } abort() {} };
        speechSynthesis.speak = () => {};
      });
      await p.locator('#start-voice').click();
      await p.waitForFunction(() => document.querySelector('#voice-status').textContent === 'Contact name.');
      await p.locator('#start-voice').click();
      await p.waitForFunction(() => document.querySelector('#start-voice').textContent === 'Start voice');
      await ctx.close();
    });
    assert.deepEqual(errors, []);
    await fs.writeFile('proof/test-results.json', JSON.stringify({ testedAt: new Date().toISOString(), browser: browser.version(), passed, limitations: ['Real phone microphone and native share sheet require on-device acceptance testing.', 'No live WPCRM entries or real customer records were used.'] }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
