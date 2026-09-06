/* The two forms visitors fill in: sharing a memory, and replying. */
import { chromium, ok, finish, reset, B, PW } from './helpers.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await reset(page.request);

// ---- the guestbook form is in the asked-for order ----
await page.goto(B + '/share', { waitUntil: 'load' });
const order = await page.evaluate(() => {
  const seen = [];
  document.querySelectorAll('#memory-form .field, #memory-form fieldset').forEach(el => {
    if (el.closest('.hp')) return;
    if (el.querySelector('#photo')) seen.push('photo');
    else if (el.querySelector('#name')) seen.push('name');
    else if (el.querySelector('#message')) seen.push('message');
    else if (el.querySelector('#private')) seen.push('private');
  });
  return seen;
});
ok('share: photograph first, the private tickbox last',
   order[0] === 'photo' && order[order.length - 1] === 'private', order.join(' → '));

// ---- the copy the family asked for, word for word ----
const shareCopy = await page.evaluate(() => ({
  title: document.querySelector('h1').textContent.trim(),
  lead: document.querySelector('.hero__note').textContent.replace(/\s+/g, ' ').trim(),
  photoLabel: document.querySelector('.filefield .field-label').textContent.replace(/\s+/g, ' ').trim(),
  nameLabel: document.querySelector('label[for=name]').textContent.trim(),
  messageLabel: document.querySelector('label[for=message]').textContent.trim(),
  counter: document.querySelector('.counter').textContent.replace(/\s+/g, ' ').trim(),
  tickTitle: document.querySelector('.choice__title').textContent.trim(),
  send: document.getElementById('submit-btn').textContent.trim(),
  note: document.querySelector('.note').textContent.replace(/\s+/g, ' ').trim()
}));
ok('share: the title reads "Share a memory"', shareCopy.title === 'Share a memory', shareCopy.title);
ok('share: the lead is the family\u2019s own line',
   shareCopy.lead === 'The family would love to hear any fond memories or stories you may have of [First Name]',
   shareCopy.lead);
ok('share: the photo field reads "A photo or image (optional)"',
   shareCopy.photoLabel === 'A photo or image (optional)', shareCopy.photoLabel);
ok('share: the name and message labels are as asked',
   shareCopy.nameLabel === 'Your name' && shareCopy.messageLabel === 'Your message',
   shareCopy.nameLabel + ' / ' + shareCopy.messageLabel);
ok('share: the counter starts at 0 / 2,000', shareCopy.counter === '0 / 2,000', shareCopy.counter);
ok('share: the tickbox reads "Keep this private"',
   shareCopy.tickTitle === 'Keep this private', shareCopy.tickTitle);
ok('share: the button says Send', shareCopy.send === 'Send', shareCopy.send);
ok('share: the removal note is at the foot',
   shareCopy.note === 'Ask the family if you would like yours removed.', shareCopy.note);

// The Send button is set in small caps by the stylesheet; the optional upload
// beside it is deliberately not, so it reads as the quieter of the two.
const casing = await page.evaluate(() => ({
  send: getComputedStyle(document.getElementById('submit-btn')).textTransform,
  upload: getComputedStyle(document.getElementById('photo-pick')).textTransform
}));
ok('share: Send is set in caps, Upload is not',
   casing.send === 'uppercase' && casing.upload === 'none', JSON.stringify(casing));

// ---- the photo field ----
await page.goto(B + '/share', { waitUntil: 'load' });
const beforePick = await page.evaluate(() => ({
  pickText: document.getElementById('photo-pick').textContent.trim(),
  inputVisible: document.getElementById('photo').getBoundingClientRect().height > 1,
  previewShown: document.getElementById('photo-preview').dataset.shown,
  altField: document.querySelectorAll('#photo-alt, [name=photo_alt]').length
}));
ok('share: no description field for the photograph', beforePick.altField === 0, JSON.stringify(beforePick));
ok('share: the picker reads "Upload" before one is picked',
   beforePick.pickText === 'Upload' && !beforePick.inputVisible, JSON.stringify(beforePick));

// a large photograph, to check both the wording and that nothing reports a size
const big = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
  const x = c.getContext('2d');
  for (let i = 0; i < 300; i++) { x.fillStyle = `hsl(${i},70%,${30 + i % 50}%)`; x.fillRect(Math.random()*4000, Math.random()*3000, 300, 300); }
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .95));
  return { bytes: [...new Uint8Array(await b.arrayBuffer())], size: b.size };
});
await page.setInputFiles('#photo', { name: 'a-very-large-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big.bytes) });
await page.waitForSelector('.preview[data-shown="true"]');
const afterPick = await page.evaluate(() => {
  const field = document.querySelector('.filefield');
  return {
    pickText: document.getElementById('photo-pick').textContent.trim(),
    thumbnails: field.querySelectorAll('img').length,
    showsSize: /\b(KB|MB|bytes)\b/i.test(field.textContent),
    showsFilename: /a-very-large-photo/i.test(field.textContent),
    removeIsSmall: (() => { const r = document.getElementById('photo-remove');
      return getComputedStyle(r).borderStyle === 'none' && parseFloat(getComputedStyle(r).fontSize) < 20; })()
  };
});
ok('share: the picker reads "Change image" once one is chosen',
   afterPick.pickText === 'Change image', JSON.stringify(afterPick));
ok('share: the picture is shown once, with no file name and no size',
   afterPick.thumbnails === 1 && !afterPick.showsSize && !afterPick.showsFilename, JSON.stringify(afterPick));
ok('share: remove is a small link, not a second button', afterPick.removeIsSmall);
console.log(`      (chose a ${(big.size/1024/1024).toFixed(1)} MB, 4000x3000 photograph)`);

// it must actually send and store
await page.fill('#name', 'A large photograph');
await page.fill('#message', 'Checking that a big picture makes it through.');
await page.click('#submit-btn');
await page.waitForSelector('#form-status[data-tone="ok"]', { timeout: 20000 });
ok('share: a very large photograph is accepted, not rejected for size', true);

// ---- the plus / minus counter ----
await page.goto(B + '/rsvp', { waitUntil: 'load' });
const step = async () => page.evaluate(() => ({
  value: document.getElementById('party').value,
  lessOff: document.getElementById('party-less').disabled,
  moreOff: document.getElementById('party-more').disabled,
  said: document.getElementById('party-said').textContent.trim()
}));
ok('rsvp: starts at one, with nothing to take away', JSON.stringify(await step()) ===
   JSON.stringify({ value: '1', lessOff: true, moreOff: false, said: '' }), JSON.stringify(await step()));
await page.click('#party-more'); await page.click('#party-more');
const up = await step();
ok('rsvp: the plus button counts up, and says so aloud',
   up.value === '3' && !up.lessOff && up.said === '3 people', JSON.stringify(up));
await page.click('#party-less');
const down = await step();
ok('rsvp: the minus button counts down', down.value === '2' && down.said === '2 people', JSON.stringify(down));
// It must not run past its ends. Clicking stops once the button is disabled —
// which is itself the point: there is nothing further to press.
const press = async (id, times) => {
  for (let i = 0; i < times; i++) {
    if (await page.locator('#' + id).isDisabled()) break;
    await page.click('#' + id);
  }
};
await press('party-more', 30);
const top = await step();
ok('rsvp: it stops at twenty rather than running on',
   top.value === '20' && top.moreOff, JSON.stringify(top));
await press('party-less', 30);
const bottom = await step();
ok('rsvp: and stops at one', bottom.value === '1' && bottom.lessOff, JSON.stringify(bottom));
// typing still works, and the buttons follow what was typed
await page.fill('#party', '7');
const typed = await step();
ok('rsvp: the number can still be typed, and the buttons keep up',
   typed.value === '7' && !typed.lessOff && !typed.moreOff, JSON.stringify(typed));
const targets = await page.evaluate(() => ['party-less', 'party-more'].map(id => {
  const r = document.getElementById(id).getBoundingClientRect();
  return Math.round(Math.min(r.width, r.height));
}));
ok('rsvp: both buttons are full-sized targets', targets.every(t => t >= 44), JSON.stringify(targets));

// ---- the copy ----
const copy = await page.evaluate(() => document.querySelector('main').innerText.replace(/\s+/g, ' '));
const wants = ['The family kindly request that loved ones inform us of their attendance',
               'Number of attendees:', 'I / We:',
               'Would love to attend:', 'The ceremony', 'The celebration of life',
               'Phone or email', 'In case anything changes.', 'Send RSVP'];
const absent = wants.filter(w => !copy.toLowerCase().includes(w.toLowerCase()));
ok('rsvp: the page reads as written', absent.length === 0, 'missing: ' + absent.join(' | '));
ok('rsvp: the afternoon is not still called a reception', !/reception/i.test(copy), copy.slice(0, 120));
const rsvpOrder = await page.evaluate(() => [...document.querySelectorAll('#rsvp-form .field, #rsvp-form fieldset')]
  .filter(el => !el.closest('.hp'))
  .map(el => el.querySelector('#party') ? 'attendees'
            : el.querySelector('#name') ? 'name'
            : el.querySelector('#ceremony') ? 'attending'
            : el.querySelector('#contact') ? 'contact' : '?'));
ok('rsvp: attendees first, then who, then which parts, then contact',
   rsvpOrder.join(' → ') === 'attendees → name → attending → contact', rsvpOrder.join(' → '));

// ---- the private tickbox ----
await page.goto(B + '/share', { waitUntil: 'load' });
const vis = await page.evaluate(() => ({
  radios: document.querySelectorAll('input[type=radio]').length,
  box: !!document.getElementById('private'),
  checkedByDefault: document.getElementById('private')?.checked,
  explains: document.querySelector('.choice__desc')?.textContent.trim() || ''
}));
ok('share: one tickbox for private, no public option to choose',
   vis.radios === 0 && vis.box && vis.checkedByDefault === false, JSON.stringify(vis));
// The tickbox must read as a tickbox, not be turned into a block heading by
// the rule that styles ordinary field labels.
const boxLayout = await page.evaluate(() => {
  const label = document.querySelector('.choice'), box = document.getElementById('private'),
        title = document.querySelector('.choice__title');
  return { display: getComputedStyle(label).display,
           titleSize: parseFloat(getComputedStyle(title).fontSize),
           sameRow: Math.abs(box.getBoundingClientRect().top - title.getBoundingClientRect().top) < 12,
           tall: label.getBoundingClientRect().height >= 44 };
});
ok('share: the tickbox sits beside its wording, at ordinary text size',
   boxLayout.display === 'flex' && boxLayout.sameRow && boxLayout.titleSize <= 22 && boxLayout.tall,
   JSON.stringify(boxLayout));

ok('share: the tickbox says who a private memory reaches',
   /only with the family/i.test(vis.explains), vis.explains);

// ---- the character count ----
await page.fill('#message', 'x'.repeat(1234));
const counter = await page.evaluate(() => {
  const el = document.querySelector('.counter');
  const s = getComputedStyle(el);
  return { text: el.textContent.trim(), align: s.textAlign,
           size: parseFloat(s.fontSize), muted: s.color !== getComputedStyle(document.body).color,
           saysCharacters: /characters/i.test(document.querySelector('label[for=message]').textContent + el.textContent),
           belowBox: el.getBoundingClientRect().top >= document.getElementById('message').getBoundingClientRect().bottom - 1 };
});
ok('share: the count is muted, right aligned below the box, and says no "characters"',
   counter.text === '1,234 / 2,000' && counter.align === 'right' && counter.muted &&
   !counter.saysCharacters && counter.belowBox, JSON.stringify(counter));

// ---- addresses are links, with an icon, and no calendar link ----
await page.goto(B + '/', { waitUntil: 'load' });
const addr = await page.evaluate(() => {
  const links = [...document.querySelectorAll('.where a')];
  return {
    count: links.length,
    allToMaps: links.every(a => /maps/.test(a.href)),
    allHaveIcon: links.every(a => !!a.querySelector('svg.pin')),
    iconsHidden: links.every(a => a.querySelector('svg.pin').getAttribute('aria-hidden') === 'true'),
    textIsAddress: links.every(a => a.textContent.trim().length > 10),
    tall: links.every(a => a.getBoundingClientRect().height >= 44),
    separateMapLinks: document.querySelectorAll('a.maplink').length,
    calendarLinks: document.querySelectorAll('a[href$=".ics"]').length
  };
});
ok('home: each address is itself the map link, with a pin icon',
   addr.count === 2 && addr.allToMaps && addr.allHaveIcon && addr.textIsAddress, JSON.stringify(addr));
ok('home: the icon is decorative, so the meaning never rests on it alone', addr.iconsHidden);
ok('home: the separate "map and directions" links are gone', addr.separateMapLinks === 0);
ok('home: no add-to-calendar link anywhere', addr.calendarLinks === 0);
ok('home: address links are a full-size tap target', addr.tall);
const icsStatus = (await page.request.get(B + '/memorial.ics')).status();
ok('the calendar file itself is gone from the site', icsStatus === 404, 'GET /memorial.ics → ' + icsStatus);

// ---- replying ----
await page.goto(B + '/rsvp', { waitUntil: 'load' });
await page.goto(B + '/', { waitUntil: 'load' });
ok('rsvp: reachable from the home page', (await page.locator('a[href="/rsvp"]').count()) > 0);

// The form to share a memory is reached from Memories, not from a menu.
await page.goto(B + '/memories', { waitUntil: 'load' });
const fromMemories = await page.evaluate(() =>
  [...document.querySelectorAll('a[href="/share"]')].some(a => a.classList.contains('btn')));
ok('memories: the form is offered there as a button', fromMemories);
ok('no page still calls itself a guestbook',
   !(await page.content()).toLowerCase().includes('guestbook'));

await page.goto(B + '/rsvp', { waitUntil: 'load' });
await page.fill('#name', 'Aoife Ní Bhriain');
await page.fill('#party', '4');
await page.uncheck('#reception');
await page.click('#submit-btn');
await page.waitForSelector('#form-status[data-tone="ok"]');
ok('rsvp: a reply is confirmed, and says how many',
   (await page.locator('#form-status').innerText()).includes('all 4 of you'));
ok('rsvp: the form is put away after sending', await page.locator('#rsvp-form').isHidden());

// validation, in the browser
await page.goto(B + '/rsvp', { waitUntil: 'load' });
await page.click('#submit-btn');
ok('rsvp: a missing name is caught kindly',
   (await page.locator('#form-status').innerText()).includes('Please add your name'));
await page.fill('#name', 'Someone');
await page.uncheck('#ceremony'); await page.uncheck('#reception');
await page.click('#submit-btn');
ok('rsvp: ticking neither part is caught',
   (await page.locator('#form-status').innerText()).includes('Which part of the day'));
await page.check('#ceremony');
await page.fill('#party', '0');
await page.click('#submit-btn');
ok('rsvp: a nonsense number is caught rather than quietly corrected',
   (await page.locator('#form-status').innerText()).includes('How many of you'),
   await page.locator('#form-status').innerText());
await page.fill('#party', '');
await page.click('#submit-btn');
ok('rsvp: an empty number is caught too',
   (await page.locator('#form-status').innerText()).includes('How many of you'));
// and nothing was sent by either attempt
const stored = await (await page.request.get(B + '/api/admin/rsvps')).json().catch(() => ({}));
ok('rsvp: neither attempt created a reply', !stored.rsvps || stored.rsvps.length === 0,
   JSON.stringify(stored.totals || stored));

// a second, larger party so the totals have something to add up
await page.goto(B + '/rsvp', { waitUntil: 'load' });
await page.fill('#name', 'The Gallaghers');
await page.fill('#party', '2');
await page.fill('#contact', '07700 900999');
await page.click('#submit-btn');
await page.waitForSelector('#form-status[data-tone="ok"]');

// ---- the family sees them ----
await page.goto(B + '/admin', { waitUntil: 'load' });
await page.waitForSelector('#login-view:not([hidden])');
await page.fill('#password', PW);
await page.click('#login-btn');
await page.waitForSelector('#admin-view:not([hidden])');
await page.locator('#tab-rsvp').click();
await page.waitForSelector('.entry');
const shown = await page.locator('#entries').innerText();
ok('admin: replies are listed with name, headcount and which parts',
   shown.includes('Aoife') && shown.includes('4 people') && shown.includes('ceremony only') &&
   shown.includes('The Gallaghers') && shown.includes('2 people') && shown.includes('ceremony and celebration'),
   shown.replace(/\n+/g, ' | ').slice(0, 160));
ok('admin: an optional phone number is shown when given', shown.includes('07700 900999'));
const totals = await page.locator('#rsvp-totals').innerText();
ok('admin: totals add up the heads, not the replies',
   totals.includes('2 replies') && totals.includes('6 at the ceremony') && totals.includes('2 at the celebration'),
   totals);
ok('admin: the reply count sits on the tab', (await page.locator('[data-count="rsvp"]').innerText()) === '(2)');

// the message tabs still work alongside
await page.locator('#tab-pending').click();
// This suite submitted a memory earlier, so the waiting list holds it.
ok('admin: the memory tabs still work alongside the replies',
   (await page.locator('#entries').innerText()).includes('A large photograph'),
   (await page.locator('#entries').innerText()).replace(/\n+/g, ' | ').slice(0, 80));
await page.locator('#tab-rsvp').click();
await page.waitForSelector('.entry');

// deleting
page.once('dialog', d => d.accept());
await page.getByRole('button', { name: 'Delete' }).first().click();
await page.waitForSelector('#admin-status[data-tone="ok"]');
ok('admin: a reply can be deleted, and the totals follow',
   (await page.locator('#rsvp-totals').innerText()).includes('1 reply'),
   await page.locator('#rsvp-totals').innerText());

// ---- replies are never public ----
const pub = await page.request.get(B + '/api/entries');
ok('replies never appear in the public guestbook feed',
   !(await pub.text()).includes('Gallaghers') && !(await pub.text()).includes('Aoife'));

await b.close();
finish(errs.length ? '\nJS errors:\n' + errs.join('\n') : '\nNo JavaScript errors.');
