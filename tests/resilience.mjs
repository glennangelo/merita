/* What happens when things are not ideal: no JavaScript, odd input, caching. */
import { chromium, ok, finish, reset, B, PW } from './helpers.mjs';
const b = await chromium.launch();

// ---- works with JavaScript switched off ----
const noJs = await b.newContext({ javaScriptEnabled: false });
const p1 = await noJs.newPage();
await p1.goto(B + '/', { waitUntil: 'load' });
const text = await p1.locator('main').innerText();
// innerText reflects text-transform, so compare without regard to case.
const flat = text.toLowerCase();
const missing = ['In Loving Memory','Memorial Ceremony','Celebration of Life','sending love from far','Memories']
  .filter(t => !flat.includes(t.toLowerCase()));
ok('no-JS: the page still reads correctly', missing.length === 0, 'missing: ' + missing.join(', '));
// Structural, so it keeps working once the family puts their own words in.
const shape = await p1.evaluate(() => {
  const events = [...document.querySelectorAll('.event')];
  const filled = s => events.every(e => (e.querySelector(s)?.textContent || '').trim().length > 3);
  return {
    events: events.length,
    heading: events.every(e => (e.querySelector('h2')?.textContent || '').trim().length > 3),
    when: filled('.when'), where: filled('.where'),
    maps: document.querySelectorAll('.where a[href*="maps"]').length,
    times: document.querySelectorAll('.event time[datetime]').length,
    name: (document.querySelector('.hero__name')?.textContent || '').trim().length > 0,
    dates: document.querySelectorAll('.hero__dates time[datetime]').length
  };
});
ok('no-JS: both events carry a venue, a date, a time, an address and a map link',
   shape.events === 2 && shape.heading && shape.when && shape.where &&
   shape.maps === 2 && shape.times >= 5 && shape.name && shape.dates === 2,
   JSON.stringify(shape));
ok('no-JS: the addresses are links to a map, with no calendar link left behind',
   (await p1.locator('.where a[href*="maps"]').count()) === 2 &&
   (await p1.locator('a[href$=".ics"]').count()) === 0);
await noJs.close();

// ---- page weight ----
const ctx = await b.newContext();
const p2 = await ctx.newPage();
let bytes = 0, fontBytes = 0, count = 0;
p2.on('response', async r => {
  try { const n = (await r.body()).length; bytes += n; if (/\.woff2$/.test(r.url())) fontBytes += n; count++; } catch {}
});
await p2.goto(B + '/', { waitUntil: 'load' });
await p2.evaluate(() => document.fonts.ready);
await p2.waitForTimeout(600);
// The typefaces are the bulk of the weight, and they are fetched once and then
// cached for a year. What must stay small is everything fetched on every visit.
ok('the page itself (without the typefaces) stays very light', bytes - fontBytes < 60000,
   `${((bytes - fontBytes)/1024).toFixed(1)} KB over ${count} requests, excluding fonts`);
ok('the typefaces are a reasonable one-time download', fontBytes < 140000,
   `${(fontBytes/1024).toFixed(1)} KB of fonts, cached for a year afterwards`);
const external = await p2.evaluate(() => performance.getEntriesByType('resource').filter(r => !r.name.startsWith(location.origin)).length);
const offsiteFonts = await p2.evaluate(() => performance.getEntriesByType('resource').filter(r => /googleapis|gstatic|typekit|fontawesome/.test(r.name)).length);
ok('fonts are self-hosted and there are no third-party requests',
   external === 0 && offsiteFonts === 0, `external:${external} offsite-fonts:${offsiteFonts}`);

// Caching: the scripts and stylesheet must be revalidated, not held. Their
// names never change, so a cached copy could never be replaced, and an edit
// would reach nobody who had visited within the hour — the page would load new
// markup and run the old script.
const caching = {};
for (const path of ['/memories', '/assets/memories.js', '/assets/styles.css', '/fonts/lora-latin.woff2']) {
  const r = await p2.request.get(B + path);
  caching[path] = r.headers()['cache-control'] || '(none)';
}
const held = /max-age=(\d+)/.exec(caching['/assets/memories.js'] || '');
ok('assets are revalidated rather than held, so a change reaches people at once',
   /no-cache|max-age=0/.test(caching['/assets/memories.js']) &&
   /no-cache|max-age=0/.test(caching['/assets/styles.css']) &&
   (!held || Number(held[1]) === 0), JSON.stringify(caching));
ok('the typefaces are still cached hard, since their content never changes',
   /immutable/.test(caching['/fonts/lora-latin.woff2']), caching['/fonts/lora-latin.woff2']);

// and revalidating must be cheap
const first = await p2.request.get(B + '/assets/memories.js');
const again = await p2.request.get(B + '/assets/memories.js', { headers: { 'If-None-Match': first.headers()['etag'] || '' } });
ok('a revalidated asset comes back "not modified", so repeat visits stay fast',
   again.status() === 304, 'HTTP ' + again.status());

// ---- print stylesheet ----
await p2.emulateMedia({ media: 'print' });
const printed = await p2.evaluate(() => {
  const hidden = el => el && getComputedStyle(el).display === 'none';
  return {
    dockHidden: hidden(document.querySelector('.dock')) !== false,
    detailsVisible: !hidden(document.querySelector('.cards')),
    urlsShown: getComputedStyle(document.querySelector('a[href^="http"]'), '::after').content !== 'none'
  };
});
ok('print: the docked button is dropped, details kept, link addresses spelled out',
   printed.dockHidden && printed.detailsVisible && printed.urlsShown, JSON.stringify(printed));
await p2.emulateMedia({ media: 'screen' });

// ---- a very long message cannot break the layout ----
await p2.goto(B + '/share', { waitUntil: 'load' });
await p2.fill('#name', 'A'.repeat(80));
await p2.fill('#message', 'Supercalifragilistic'.repeat(60) + '\n\n\n\n\nand a memory.');
await p2.click('#submit-btn');
await p2.waitForSelector('#form-status[data-tone="ok"]');
const res = await (await fetch(B + '/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({password:'test-password-1234'}) }));
const cookie = res.headers.get('set-cookie').split(';')[0];
const list = await (await fetch(B + '/api/admin/entries', { headers: { Cookie: cookie } })).json();
const e = list.pending[0];
ok('server trims runs of blank lines in a message', !/\n{3,}/.test(e.message));
await p2.goto(B + '/admin', { waitUntil: 'load' });
await p2.fill('#password','test-password-1234'); await p2.click('#login-btn');
await p2.waitForSelector('.entry');
ok('an unbroken 1200-character word does not push the page sideways',
   await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
   'scrollWidth=' + await p2.evaluate(() => document.documentElement.scrollWidth) + ' vs ' + await p2.evaluate(() => window.innerWidth));

// ---- a message cannot inject HTML ----
await p2.goto(B + '/share', { waitUntil: 'load' });
await p2.fill('#name', '<img src=x onerror=alert(1)>');
await p2.fill('#message', '<script>window.__pwned=1<\/script><b>bold?</b>');
await p2.click('#submit-btn');
await p2.waitForSelector('#form-status[data-tone="ok"]');
await p2.goto(B + '/admin', { waitUntil: 'load' });
await p2.waitForSelector('.entry');
const body = await p2.locator('#entries').innerHTML();
ok('a message containing HTML is shown as plain text, not executed',
   !body.includes('<b>bold?</b>') && body.includes('&lt;b&gt;bold?&lt;/b&gt;') && !(await p2.evaluate(() => window.__pwned)));
await b.close();
finish();
