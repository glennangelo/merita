/* The family's own side of the site: correcting a memory, the limits that
   hold back a flood, and the things that must never leak out. */

import { chromium, ok, finish, reset, adminHeaders, B, PW } from './helpers.mjs';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await reset(page.request);

/* A memory with a picture, so the shape of it can be checked as well. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

async function share(fields) {
  return page.request.post(B + '/api/entries', {
    multipart: Object.assign({ name: 'Aoife', message: 'A memory.', visibility: 'public' }, fields)
  });
}

/* ---- the spam trap, which had no test at all ---- */

const trapped = await share({ name: 'Bot', message: 'Buy things.', subject: 'http://spam.example' });
ok('a filled-in trap is answered politely and stored nowhere', trapped.ok(), 'status ' + trapped.status());
{
  const headers = await adminHeaders(page.request);
  const all = await (await page.request.get(B + '/api/admin/entries', { headers })).json();
  const everything = [...all.pending, ...all.private, ...all.public];
  ok('nothing the trap caught reaches the family',
     !everything.some(e => e.name === 'Bot'), everything.length + ' stored');
}

/* The trap is called "subject", not "website": form-filling extensions
   recognise "website" and fill it in for a real visitor, whose message would
   then be thrown away as a bot's. */
{
  // One page, so these have to be visited in turn — two navigations at once
  // abort each other.
  const pages = [];
  for (const path of ['/share', '/rsvp']) {
    await page.goto(B + path, { waitUntil: 'load' });
    pages.push(await page.evaluate(() => ({
      trap: !!document.querySelector('.hp input'),
      named: document.querySelector('.hp input')?.name,
      hidden: document.querySelector('.hp input')?.getBoundingClientRect().left < 0
    })));
  }
  ok('both forms carry the trap, out of sight and not named "website"',
     pages.every(p => p.trap && p.named === 'subject' && p.hidden), JSON.stringify(pages));
}

/* ---- a picture keeps its shape, so the page does not jump ---- */

await reset(page.request);
await share({ photo: { name: 'p.gif', mimeType: 'image/gif', buffer: PIXEL }, photo_w: '900', photo_h: '600' });
{
  const headers = await adminHeaders(page.request);
  const all = await (await page.request.get(B + '/api/admin/entries', { headers })).json();
  const entry = all.pending[0];
  ok('the shape of a picture is stored with it',
     entry.photo_w === 900 && entry.photo_h === 600, JSON.stringify({ w: entry.photo_w, h: entry.photo_h }));
  await page.request.post(`${B}/api/admin/entries/${entry.id}`, { headers, data: { action: 'approve' } });
}
await page.goto(B + '/memories', { waitUntil: 'load' });
await page.waitForSelector('.entry__photo');
{
  const attrs = await page.evaluate(() => {
    const i = document.querySelector('.entry__photo');
    return { w: i.getAttribute('width'), h: i.getAttribute('height') };
  });
  ok('the memories page reserves room for a picture before it loads',
     attrs.w === '900' && attrs.h === '600', JSON.stringify(attrs));
}

/* A width the browser never measured must not be taken on trust. */
await reset(page.request);
await share({ name: 'Odd', photo: { name: 'p.gif', mimeType: 'image/gif', buffer: PIXEL },
              photo_w: 'not a number', photo_h: '-5' });
{
  const headers = await adminHeaders(page.request);
  const all = await (await page.request.get(B + '/api/admin/entries', { headers })).json();
  const entry = all.pending[0];
  ok('a nonsense size is discarded rather than written to the page',
     entry.photo_w === null && entry.photo_h === null, JSON.stringify({ w: entry.photo_w, h: entry.photo_h }));
}

/* ---- correcting a memory ---- */

await reset(page.request);
await share({ name: 'Seamus O Brien', message: 'She tought me to bake.' });
await page.goto(B + '/admin', { waitUntil: 'load' });
await page.waitForSelector('#login-view:not([hidden])');
await page.fill('#password', PW);
await page.click('#login-btn');
await page.waitForSelector('#admin-view:not([hidden])');
await page.waitForSelector('.entry');

await page.getByRole('button', { name: 'Edit' }).first().click();
await page.waitForSelector('.edit');
{
  const open = await page.evaluate(() => ({
    name: document.querySelector('.edit input').value,
    message: document.querySelector('.edit textarea').value,
    focused: document.activeElement.tagName
  }));
  ok('the edit form opens holding what was written, ready to type in',
     open.name === 'Seamus O Brien' && open.message === 'She tought me to bake.' && open.focused === 'INPUT',
     JSON.stringify(open));
}

await page.fill('.edit input', "Seamus O'Brien");
await page.fill('.edit textarea', 'She taught me to bake.');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForSelector('#admin-status[data-tone="ok"]');
{
  const shown = await page.locator('#entries').innerText();
  ok('the correction is saved and shown', shown.includes("Seamus O'Brien") && shown.includes('She taught me to bake.'),
     shown.replace(/\n+/g, ' | ').slice(0, 110));
  ok('the family is reminded that the wording was changed', shown.includes('Edited by the family'));
  ok('focus lands on what was said, not back at the top of the page',
     (await page.evaluate(() => document.activeElement.id)) === 'admin-status');
}

/* An edit is a correction, not a way to blank a memory. */
{
  const headers = await adminHeaders(page.request);
  const all = await (await page.request.get(B + '/api/admin/entries', { headers })).json();
  const id = all.pending[0].id;
  const empty = await page.request.post(`${B}/api/admin/entries/${id}`,
    { headers, data: { action: 'edit', name: '   ', message: 'still here' } });
  ok('an edit cannot leave a memory without a name', empty.status() === 400, 'status ' + empty.status());

  const stranger = await page.request.post(`${B}/api/admin/entries/${id}`,
    { data: { action: 'edit', name: 'Nobody', message: 'Rewritten.' } });
  ok('nobody who is not signed in can rewrite a memory', stranger.status() === 401, 'status ' + stranger.status());
}

/* ---- how many can arrive at once ---- */

await reset(page.request);
{
  // Eight from one visitor inside ten minutes is the limit; the ninth waits.
  const results = [];
  for (let i = 0; i < 9; i++) results.push((await share({ message: 'Memory ' + i })).status());
  const allowed = results.filter(s => s === 201).length;
  ok('a visitor may send several memories in a row', allowed >= 8, results.join(','));
  ok('but a flood from one visitor is held back', results[8] === 429, 'ninth was ' + results[8]);
  const said = await (await share({ message: 'one more' })).json();
  ok('and is told what to do about it, not just refused',
     /wait a little/i.test(said.error || ''), said.error);
}

/* ---- what the family sees, and nobody else ---- */

await reset(page.request);
await page.request.post(B + '/api/rsvp', {
  data: { name: 'The Gallaghers', party_size: 3, ceremony: true, reception: true, contact: '07700 900999' }
});
{
  const pub = await (await page.request.get(B + '/api/entries')).text();
  ok('a reply never appears in anything a visitor can read',
     !pub.includes('Gallaghers') && !pub.includes('900999'), pub.slice(0, 80));

  const headers = await adminHeaders(page.request);
  const replies = await (await page.request.get(B + '/api/admin/rsvps', { headers })).json();
  // Rate limiting has to tell one visitor from another. It does that with a
  // hash, so the database holds no address — and the hash must not travel out
  // of it either, or it becomes a way to link one person's messages together.
  ok('the family page carries no trace of who sent what, only what they sent',
     !JSON.stringify(replies).includes('sender'), Object.keys(replies.rsvps[0]).join(','));
}

await b.close();
finish(errs.length ? '\nJS errors:\n' + errs.join('\n') : '\nNo JavaScript errors.');
