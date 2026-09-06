/* Keyboard, screen reader, tap targets, and the moderation round trip. */
import { chromium, ok, finish, reset, B, PW } from './helpers.mjs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const cspErrors = [], jsErrors = [];
page.on('pageerror', e => jsErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') (/Content Security Policy/.test(m.text()) ? cspErrors : jsErrors).push(m.text()); });

await reset(page.request);

// ---- tap targets + landmarks across every page ----
for (const p of ['/', '/memories', '/share', '/admin']) {
  await page.goto(B + p, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const small = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('a, button, input, textarea, select').forEach(el => {
      const r = el.getBoundingClientRect();
      const hidden = el.classList.contains('visually-hidden');
      // radios and checkboxes are hit by way of the label wrapping them
      const box = el.type === 'radio' || el.type === 'checkbox';
      const wrapper = box ? el.closest('label') : null;
      const wrapped = wrapper && wrapper.getBoundingClientRect().height >= 44;
      if (r.width && r.height && r.height < 44 && !hidden && !el.closest('.hp') && !(box && wrapped))
        bad.push((el.textContent || el.type).trim().slice(0, 24) + '=' + Math.round(r.height));
    });
    return bad;
  });
  const a11y = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    main: !!document.querySelector('main'),
    lang: document.documentElement.lang,
    imgNoAlt: [...document.querySelectorAll('img')].filter(i => i.alt === null || i.alt === undefined).length,
    labelless: [...document.querySelectorAll('input:not([type=hidden]), textarea, select')]
      .filter(el => !el.labels?.length && !el.getAttribute('aria-label')).length,
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1
  }));
  ok(`${p} tap targets >= 44px`, small.length === 0, small.join('; '));
  ok(`${p} landmarks/labels/alt/lang ok`,
     a11y.h1 >= 1 && a11y.main && a11y.lang === 'en' && a11y.imgNoAlt === 0 && a11y.labelless === 0 && !a11y.hscroll,
     JSON.stringify(a11y));
}

// Contrast lives in design-test.mjs, which checks every colour on the page in
// both schemes and fails when a selector stops matching. The version that was
// here measured before the stylesheet had applied, so it read black on nothing
// and had been passing on timing rather than on the colours being right.

// ---- keyboard only: reach the guestbook from the home page ----
// 'load' plus fonts: measuring computed styles before the stylesheet applies
// reads the browser's own defaults, which is how this check came to report a
// 1px outline on a page that draws a 3px one.
await page.goto(B + '/', { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.keyboard.press('Tab');
// With no header there is nothing to skip past, so the first Tab should land
// straight on real content rather than on some leftover control.
const firstStop = await page.evaluate(() => {
  const el = document.activeElement;
  return { tag: el.tagName, inMain: !!el.closest('main'), text: (el.textContent || '').trim().slice(0, 40) };
});
ok('first Tab lands directly on the content', firstStop.inMain, JSON.stringify(firstStop));
const focusRing = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineWidth; });
ok('focused element has a visible outline', parseFloat(focusRing) >= 3, focusRing);

// ---- submit with a photo, then moderate it in the admin UI ----
await page.goto(B + '/share', { waitUntil: 'load' });
await page.fill('#name', 'Aoife Ní Bhriain');
await page.fill('#message', 'He always had a story ready, and the time to tell it.');
const big = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
  const x = c.getContext('2d');
  for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i},60%,${30+i%40}%)`; x.fillRect(Math.random()*3000, Math.random()*2000, 200, 200); }
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
  return { bytes: [...new Uint8Array(await b.arrayBuffer())], size: b.size };
});
await page.setInputFiles('#photo', { name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big.bytes) });
await page.waitForSelector('.preview[data-shown="true"]');
// The form no longer reports a size, so measure the picture it is holding.
await page.waitForFunction(() => {
  const i = document.getElementById('photo-preview-img');
  return i && i.complete && i.naturalWidth > 0;
});
const shrunk = await page.evaluate(() => {
  const i = document.getElementById('photo-preview-img');
  return { w: i.naturalWidth, h: i.naturalHeight };
});
ok('photo shrunk in the browser before upload',
   Math.max(shrunk.w, shrunk.h) <= 2000 && shrunk.w < 3000,
   `3000x2000 chosen -> ${shrunk.w}x${shrunk.h} to send`);
await page.click('#submit-btn');
await page.waitForSelector('#form-status[data-tone="ok"]');
ok('submission confirmed', true);

// a private one too
await page.goto(B + '/share', { waitUntil: 'load' });
await page.fill('#name', 'A quiet friend');
await page.fill('#message', 'For the family only.');
await page.check('#private');
await page.click('#submit-btn');
await page.waitForSelector('#form-status[data-tone="ok"]');

// public guestbook must not show either yet
await page.goto(B + '/memories', { waitUntil: 'load' });
// Wait for the list to render; asserting first would pass on an empty page
// that simply had not loaded yet.
await page.waitForSelector('.empty, .entry');
ok('unapproved memories are not on the public page', await page.locator('.empty').count() === 1);

// ---- admin ----
await page.goto(B + '/admin', { waitUntil: 'load' });
await page.waitForSelector('#login-view:not([hidden])');
await page.fill('#password', 'not-it');
await page.click('#login-btn');
await page.waitForSelector('#login-status[data-tone="error"]');
ok('admin: wrong password refused kindly', (await page.locator('#login-status').innerText()).includes('not right'));
await page.fill('#password', PW);
await page.click('#login-btn');
await page.waitForSelector('#admin-view:not([hidden])');
ok('admin: signs in', true);
await page.waitForSelector('.entry');
ok('admin: pending tab shows the public message',
   (await page.locator('#entries').innerText()).includes('Aoife'));
ok('admin: pending count is 1', (await page.locator('[data-count="pending"]').innerText()) === '(1)');
// Wait for the image to settle rather than catching it mid-flight.
const adminPhotoLoaded = await page.locator('.entry__photo').evaluate(i =>
  i.complete ? i.naturalWidth > 0
             : new Promise(r => { i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); }));
ok('admin: the photo of an unapproved message loads for the family', adminPhotoLoaded);
ok('admin: a photo without a description still gets a sensible one',
   (await page.locator('.entry__photo').getAttribute('alt')) === 'A photograph shared by Aoife Ní Bhriain.',
   await page.locator('.entry__photo').getAttribute('alt'));

await page.locator('#tab-private').click();
ok('admin: private tab shows the private message',
   (await page.locator('#entries').innerText()).includes('quiet friend'));
ok('admin: private count is 1', (await page.locator('[data-count="private"]').innerText()) === '(1)');

// arrow-key navigation between tabs
await page.locator('#tab-private').focus();
await page.keyboard.press('ArrowRight');
ok('admin: arrow keys move between tabs',
   await page.evaluate(() => document.activeElement.id) === 'tab-public');

await page.locator('#tab-pending').click();
await page.getByRole('button', { name: /Approve/ }).click();
await page.waitForSelector('#admin-status[data-tone="ok"]');
ok('admin: approving reports success', (await page.locator('#admin-status').innerText()).includes('with the memories'));
ok('admin: pending list is now empty', (await page.locator('#entries').innerText()).includes('Nothing waiting'));

await page.goto(B + '/memories', { waitUntil: 'load' });
await page.waitForSelector('.entry');
ok('memories page now shows the approved message',
   (await page.locator('.entry__by').innerText()).includes('Aoife Ní Bhriain'));
const publicPhotoLoaded = await page.locator('.entry__photo').evaluate(i =>
  i.complete ? i.naturalWidth > 0
             : new Promise(r => { i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); }));
ok('memories page shows the photograph', publicPhotoLoaded);
ok('memories page still hides the private message',
   !(await page.locator('#entries').innerText()).includes('quiet friend'));
ok('memories page shows no count once loaded',
   (await page.locator('#load-status').innerText()).trim() === '',
   JSON.stringify(await page.locator('#load-status').innerText()));

// ---- signing out ----
await page.goto(B + '/admin', { waitUntil: 'load' });
await page.waitForSelector('#admin-view:not([hidden])');
ok('admin: session is remembered across page loads', true);
await page.click('#logout-btn');
await page.waitForSelector('#login-view:not([hidden])');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#login-view:not([hidden])');
ok('admin: signing out really ends the session', await page.locator('#admin-view').isHidden());

await browser.close();
finish('\nCSP violations: ' + (cspErrors.length || 'none') +
       '\nJS errors: ' + (jsErrors.length ? '\n' + jsErrors.join('\n') : 'none'));
