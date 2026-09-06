/* Typography, colour contrast, spacing, and the shape of each page. */
import { chromium, ok, finish, reset, B, PW } from './helpers.mjs';
const b = await chromium.launch();

const CONTRAST = `(() => {
  const lum = c => { const m=c.match(/[\\d.]+/g).map(Number); const [r,g,bb]=m.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;}); return 0.2126*r+0.7152*g+0.0722*bb; };
  const ratio = (a,bg) => { const [x,y]=[lum(a),lum(bg)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
  const bgOf = el => { for (let n=el;n;n=n.parentElement){ const c=getComputedStyle(n).backgroundColor; if(c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; } return getComputedStyle(document.body).backgroundColor; };
  const out = {};
  const check = (label, sel, prop) => {
    // A selector that no longer matches must show as a failure, not quietly
    // drop out of the results and leave the check looking like it passed.
    const el = document.querySelector(sel);
    if (!el) { out[label] = 'MISSING: ' + sel; return; }
    const s = getComputedStyle(el);
    const bg = prop === 'own' ? s.backgroundColor : bgOf(el.parentElement || el);
    out[label] = +ratio(s.color, /rgba\\(0, 0, 0, 0\\)|transparent/.test(bg) ? bgOf(el) : bg).toFixed(1);
  };
  check('body',       '.event .aside');
  check('bodyText',   '.event .where');
  check('heroDates',  '.hero__dates');
  check('eventWhen',  '.event .when');
  check('eyebrowLbl', '.eyebrow');
  check('epitaph',    '.epitaph');
  check('btnSolid',   '.btn:not(.btn--ghost)', 'own');
  check('btnGhost',   '.btn--ghost');
  check('notice',     '.notice');
  check('bandEyebrow','.band .eyebrow');
  check('bandLead',   '.band__lead');
  check('bandGhost',  '.band .btn--ghost');
  check('bandSolid',  '.band .btn:not(.btn--ghost)', 'own');
  check('footer',     '.footer p');
  return out;
})()`;

for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(B + '/', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const r = await p.evaluate(CONTRAST);
  const fails = Object.entries(r).filter(([, v]) => typeof v !== 'number' || v < 7);
  ok(`asked for ${scheme}: every text colour clears WCAG AAA (7:1)`,
     fails.length === 0, fails.length ? fails.map(([k,v]) => `${k}=${v}`).join(', ') : JSON.stringify(r));
  // There is deliberately no dark mode: the page must stay on paper either way.
  const ground = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(`asked for ${scheme}: the page stays light`, ground === 'rgb(248, 244, 237)', ground);
  await ctx.close();
}

// fonts really load and are really applied
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const fontReqs = [];
p.on('response', r => { if (/\.woff2$/.test(r.url())) fontReqs.push([r.url().split('/').pop(), r.status()]); });
let bytes = 0, count = 0;
p.on('response', async r => { try { bytes += (await r.body()).length; count++; } catch {} });
await p.goto(B + '/', { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
ok('the two display/body fonts download successfully',
   fontReqs.length >= 2 && fontReqs.every(([, s]) => s === 200), JSON.stringify(fontReqs));
const applied = await p.evaluate(() => ({
  name: getComputedStyle(document.querySelector('.hero__name')).fontFamily.split(',')[0].replace(/"/g,''),
  body: getComputedStyle(document.querySelector('.event .where')).fontFamily.split(',')[0].replace(/"/g,''),
  nameLoaded: document.fonts.check('600 3rem "Cormorant Garamond"'),
  bodyLoaded: document.fonts.check('400 1rem "Lora"')
}));
ok('Cormorant Garamond is used for the name, Lora for the text',
   applied.name === 'Cormorant Garamond' && applied.body === 'Lora' && applied.nameLoaded && applied.bodyLoaded,
   JSON.stringify(applied));
ok('page weight stays reasonable with fonts', bytes < 260000, `${count} requests, ${(bytes/1024).toFixed(0)} KB`);
const ext = await p.evaluate(() => performance.getEntriesByType('resource').filter(r => !r.name.startsWith(location.origin)).length);
ok('still no third-party requests at all', ext === 0, 'external=' + ext);

// no text-size control anywhere
for (const path of ['/', '/memories', '/share', '/admin']) {
  await p.goto(B + path, { waitUntil: 'load' });
  const leftovers = await p.evaluate(() =>
    document.querySelectorAll('[data-textsize-control], .textsize, script[src*="textsize"]').length);
  ok(`${path}: text-size control is gone`, leftovers === 0, 'found ' + leftovers);
}

// default size is genuinely accessible
await p.goto(B + '/', { waitUntil: 'load' });
const sizes = await p.evaluate(() => ({
  root: parseFloat(getComputedStyle(document.documentElement).fontSize),
  body: parseFloat(getComputedStyle(document.querySelector('.event .where')).fontSize),
  smallest: Math.min(...[...document.querySelectorAll('main *, .footer *, .nav a')]
    .filter(el => el.children.length === 0 && el.textContent.trim())
    .map(el => parseFloat(getComputedStyle(el).fontSize)))
}));
ok('default body text is at least 19px with no control needed', sizes.body >= 19, JSON.stringify(sizes));
ok('nothing on the page is smaller than 15px', sizes.smallest >= 15, JSON.stringify(sizes));

// respects a reader who has enlarged their browser's default font
const css = await (await fetch(B + '/assets/styles.css')).text();
const rootRule = /html\s*\{[^}]*?font-size:\s*([^;]+);/.exec(css);
ok("the root text size is relative, so a reader's own browser setting still applies",
   !!rootRule && /%|rem|em/.test(rootRule[1]) && !/px/.test(rootRule[1]),
   'html font-size: ' + (rootRule ? rootRule[1].trim() : 'not found') + ' (computes to 20px at the standard 16px default)');

// the boxed-card look is gone
for (const path of ['/', '/memories', '/share', '/admin']) {
  await p.goto(B + path, { waitUntil: 'load' });
  const cards = await p.evaluate(() => document.querySelectorAll('.card').length);
  ok(`${path}: no card containers`, cards === 0, 'found ' + cards);
}

// the band spans the window; it must not push the page sideways at any width
for (const w of [320, 390, 768, 1280, 1920]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 } });
  const pg = await c.newPage();
  await pg.goto(B + '/', { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const r = await pg.evaluate(() => ({
    over: document.documentElement.scrollWidth > window.innerWidth + 1,
    bandSpans: (() => { const b = document.querySelector('.band'); return b && Math.round(b.getBoundingClientRect().width) >= window.innerWidth - 1; })()
  }));
  ok(`band at ${w}px: spans the width, no sideways scroll`, r.bandSpans && !r.over, JSON.stringify(r));
  await c.close();
}

// The two events: abreast when there is room, stacked when there is not, and
// the RSVP always further from them than they are from each other.
for (const [w, expect] of [[1440, 'side-by-side'], [1100, 'side-by-side'], [860, 'stacked'], [390, 'stacked']]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 } });
  const pg = await c.newPage();
  await pg.goto(B + '/', { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const r = await pg.evaluate(() => {
    const ev = [...document.querySelectorAll('.event')].map(e => e.getBoundingClientRect());
    const acts = document.querySelector('.events + .actions').getBoundingClientRect();
    const events = document.querySelector('.events').getBoundingClientRect();
    return {
      layout: ev.length === 2 && Math.abs(ev[0].top - ev[1].top) < 4 ? 'side-by-side' : 'stacked',
      // gap between the two events, and the gap above the RSVP
      between: ev.length === 2 ? Math.round(Math.min(Math.abs(ev[1].top - ev[0].bottom), Math.abs(ev[1].left - ev[0].right))) : 0,
      aboveRsvp: Math.round(acts.top - events.bottom),
      rsvpBelowBoth: ev.every(e => acts.top >= e.bottom - 1)
    };
  });
  ok(`${w}px: events ${expect}, RSVP beneath both and set further off`,
     r.layout === expect && r.rsvpBelowBoth && r.aboveRsvp > r.between,
     JSON.stringify(r));
  await c.close();
}

// The band must be the same paper taken deeper, not a second colour set
// against it. Its background is a gradient, so read its stops and compare
// their hue and lightness with the page's own ground.
await p.goto(B + '/', { waitUntil: 'load' });
const shade = await p.evaluate(() => {
  const parse = c => c.match(/\d+/g).slice(0, 3).map(Number);
  const hue = ([r, g, b]) => { const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    if (mx === mn) return 0; const d = mx - mn;
    const h = mx === r ? ((g-b)/d) % 6 : mx === g ? (b-r)/d + 2 : (r-g)/d + 4;
    return ((h * 60) + 360) % 360; };
  const light = ([r, g, b]) => (r + g + b) / 3;
  const paper = parse(getComputedStyle(document.body).backgroundColor);
  const stops = (getComputedStyle(document.querySelector('.band')).backgroundImage
    .match(/rgba?\([^)]+\)/g) || []).map(parse);
  return {
    paperHue: Math.round(hue(paper)), paperLight: Math.round(light(paper)),
    stops: stops.map(c => ({ hue: Math.round(hue(c)), light: Math.round(light(c)) })),
    sameFamily: stops.every(c => Math.abs(hue(c) - hue(paper)) < 20),
    darker: stops.every(c => light(c) < light(paper))
  };
});
ok('the band is the same paper taken deeper, not a different colour',
   shade.stops.length >= 2 && shade.sameFamily && shade.darker, JSON.stringify(shade));

// No header anywhere, and nothing left over that pointed at one.
for (const path of ['/', '/rsvp', '/memories', '/share', '/admin']) {
  await p.goto(B + path, { waitUntil: 'load' });
  const leftovers = await p.evaluate(() => ({
    header: document.querySelectorAll('header, .topbar, .nav').length,
    skip: document.querySelectorAll('a.skip').length,
    danglingSkip: [...document.querySelectorAll('a[href^="#"]')]
      .filter(a => !document.querySelector(a.getAttribute('href'))).length
  }));
  ok(`${path}: no header, no orphaned skip link`,
     leftovers.header === 0 && leftovers.skip === 0 && leftovers.danglingSkip === 0,
     JSON.stringify(leftovers));
}

// Every page but the home page carries the name at its top, and that name is
// the way back. The home page names them in its hero instead.
for (const path of ['/rsvp', '/memories', '/share', '/admin']) {
  await p.goto(B + path, { waitUntil: 'load' });
  // The family's page keeps both its views hidden until it has worked out
  // whether anyone is signed in, so wait for the one that shows.
  await p.waitForSelector('.wordmark', { state: 'visible' });
  const w = await p.evaluate(() => {
    const visible = [...document.querySelectorAll('.wordmark')].find(e => e.getBoundingClientRect().height > 0);
    const el = visible;
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent.trim().replace(/\s+/g, ' '),
      goesHome: new URL(el.href).pathname === '/',
      namesThem: /In Loving Memory of/i.test(el.textContent),
      tall: Math.round(r.height) >= 44,
      aboveTheFold: r.top < 200,
      saysWhereItGoes: /back to the memorial page/i.test(el.textContent)
    };
  });
  const gap = await p.evaluate(() => {
    const w = [...document.querySelectorAll('.wordmark')].find(e => e.getBoundingClientRect().height > 0);
    const next = w.parentElement.querySelector('h1, .page-title');
    return Math.round(next.getBoundingClientRect().top - w.getBoundingClientRect().bottom);
  });
  ok(`${path}: the name is set clear of the content beneath it`, gap >= 32, gap + 'px');

  ok(`${path}: the name at the top, and it leads home`,
     !w.missing && w.goesHome && w.namesThem && w.tall && w.aboveTheFold && w.saysWhereItGoes,
     JSON.stringify(w));
}
await p.goto(B + '/', { waitUntil: 'load' });
ok('the home page carries no wordmark, since its hero already names them',
   (await p.locator('.wordmark').count()) === 0);

// With the header gone, every page must still offer a way onwards.
for (const [path, expect] of [['/', ['/rsvp', '/share', '/memories']], ['/rsvp', ['/']],
                              ['/memories', ['/', '/share']], ['/share', ['/memories']]]) {
  await p.goto(B + path, { waitUntil: 'load' });
  const links = await p.evaluate(() => [...document.querySelectorAll('a[href^="/"]')].map(a => new URL(a.href).pathname));
  const missing = expect.filter(e => !links.includes(e));
  ok(`${path}: still leads somewhere (${expect.join(', ')})`, missing.length === 0, 'missing ' + missing.join(', '));
}

// Seed this suite's own memories, one very wide and one very tall, so the size
// cap is tested against real images however the database was left.
async function seedMemory(page, name, w, h) {
  const bytes = await page.evaluate(async ([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#8aa'; x.fillRect(0, 0, w, h);
    const bl = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
    return [...new Uint8Array(await bl.arrayBuffer())];
  }, [w, h]);
  await page.goto(B + '/share', { waitUntil: 'load' });
  await page.fill('#name', name);
  await page.fill('#message', 'A memory, for the purposes of checking the layout.');
  await page.setInputFiles('#photo', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
  await page.waitForSelector('.preview[data-shown="true"]');
  await page.click('#submit-btn');
  await page.waitForSelector('#form-status[data-tone="ok"]');
}
await p.goto(B + '/share', { waitUntil: 'load' });
await seedMemory(p, 'A wide photograph', 2400, 1000);
await seedMemory(p, 'A tall photograph', 1000, 2400);
await p.goto(B + '/admin', { waitUntil: 'load' });
await p.waitForSelector('#login-view:not([hidden])');
await p.fill('#password', 'test-password-1234');
await p.click('#login-btn');
await p.waitForSelector('#admin-view:not([hidden])');
for (let i = 0; i < 2; i++) {
  await p.waitForSelector('.entry');
  await p.getByRole('button', { name: /^Approve$/ }).first().click();
  await p.waitForSelector('#admin-status[data-tone="ok"]');
}

// Memories: a photograph sits within the page rather than filling it.
await p.goto(B + '/memories', { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
// Scroll through so the lazily-loaded photographs actually load, then wait for
// them: measuring an image that has not loaded yields zero, which would pass
// any size cap without testing a thing.
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
  await Promise.all([...document.images].filter(i => !i.complete)
    .map(i => new Promise(r => { i.onload = i.onerror = r; })));
});
await p.waitForTimeout(250);
const shots = await p.evaluate(() => [...document.querySelectorAll('.entry__photo')].map(i => {
  const r = i.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), natural: i.naturalWidth + 'x' + i.naturalHeight };
}));
ok('memories: photographs actually loaded, so the cap is being tested',
   shots.length > 0 && shots.every(i => i.w > 0 && i.h > 0), JSON.stringify(shots));
ok('memories: no photograph is allowed to dominate the page',
   shots.every(i => i.w <= 24 * 20 + 2 && i.h <= 20 * 20 + 2), JSON.stringify(shots));

// No dates on memories, in either view. Replies keep theirs — the family needs
// to know when someone answered.
const DATEISH = /\b(19|20)\d\d\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/;
const memText = await p.evaluate(() => [...document.querySelectorAll('.entry')].map(e => e.textContent).join(' '));
ok('memories: no dates anywhere on the public page', !DATEISH.test(memText),
   (memText.match(DATEISH) || []).join(', '));

// The docked button: fixed to the foot of the window, still there once the
// page is scrolled, and never sitting on top of the last of the content.
const dock = await p.evaluate(() => {
  const d = document.querySelector('.dock');
  return { fixed: getComputedStyle(d).position === 'fixed',
           top: d.getBoundingClientRect().top,
           hasButton: !!d.querySelector('a[href="/share"]') };
});
// The page scrolls smoothly, so an animated jump would be measured mid-flight.
await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
await p.waitForTimeout(400);
const docked = await p.evaluate(() => {
  const d = document.querySelector('.dock').getBoundingClientRect();
  const f = document.querySelector('.footer').getBoundingClientRect();
  return { atBottom: Math.abs(d.bottom - window.innerHeight) < 2,
           unmoved: true, dockTop: Math.round(d.top), footerBottom: Math.round(f.bottom),
           scrolledToEnd: Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 4,
           clearsFooter: f.bottom <= d.top + 1 };
});
ok('memories: the share button stays docked at the foot while scrolling',
   dock.fixed && dock.hasButton && Math.abs(dock.top - docked.dockTop) < 2 && docked.atBottom,
   JSON.stringify({ ...dock, ...docked }));
const centred = await p.evaluate(() => {
  const d = document.querySelector('.dock').getBoundingClientRect();
  const btn = document.querySelector('.dock .btn').getBoundingClientRect();
  return { leftGap: Math.round(btn.left - d.left), rightGap: Math.round(d.right - btn.right) };
});
ok('memories: the docked button is centred, not adrift to one side',
   Math.abs(centred.leftGap - centred.rightGap) <= 2, JSON.stringify(centred));

ok('memories: at the very bottom the page ends clear of the button, not behind it',
   docked.scrolledToEnd && docked.clearsFooter, JSON.stringify(docked));

// The family's page: memories bare, replies dated.
await p.goto(B + '/admin', { waitUntil: 'load' });
// This suite signed in earlier to approve its memories, so the session may
// already be live and the sign-in form never shown.
await p.waitForSelector('#login-view:not([hidden]), #admin-view:not([hidden])');
if (await p.locator('#login-view:not([hidden])').count()) {
  await p.fill('#password', 'test-password-1234');
  await p.click('#login-btn');
}
await p.waitForSelector('#admin-view:not([hidden])');
await p.locator('#tab-public').click();
await p.waitForSelector('.entry');
const adminMem = await p.evaluate(() => [...document.querySelectorAll('.entry')].map(e => e.textContent).join(' '));
ok('admin: memories carry no date there either', !DATEISH.test(adminMem),
   (adminMem.match(DATEISH) || []).join(', '));

// and it has no business on the other pages
for (const path of ['/', '/rsvp', '/share']) {
  await p.goto(B + path, { waitUntil: 'load' });
  ok(`${path}: no docked bar`, (await p.locator('.dock').count()) === 0);
}


// The hero fades in on load. If that animation ever failed to run or to
// finish, the name and dates would sit at opacity 0 — an invisible memorial.
await p.goto(B + '/', { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
const heroVisible = await p.evaluate(() => ['.hero__eyebrow', '.portrait', '.hero__name', '.hero__dates']
  .map(sel => { const el = document.querySelector(sel);
    return { sel, ok: !!el && +getComputedStyle(el).opacity === 1 && el.getBoundingClientRect().height > 0 }; })
  .filter(r => !r.ok).map(r => r.sel));
ok('the name, dates and portrait are visible once the page settles',
   heroVisible.length === 0, heroVisible.join(', '));

// and immediately visible for anyone who has asked for reduced motion
const rm = await b.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
const rp = await rm.newPage();
await rp.goto(B + '/', { waitUntil: 'load' });
const rmVisible = await rp.evaluate(() =>
  +getComputedStyle(document.querySelector('.hero__name')).opacity === 1);
ok('with reduced motion the name is visible at once, not faded in', rmVisible);
await rm.close();

// the footer's own colours, checked on a page that actually has a footer link
await p.goto(B + '/memories', { waitUntil: 'load' });
const fc = await p.evaluate(() => {
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number);
    const [r,g,b] = m.slice(0,3).map(v => { v/=255; return v<=0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4; });
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  const ratio = (a,bg) => { const [x,y] = [lum(a), lum(bg)].sort((m,n) => n-m); return (x+0.05)/(y+0.05); };
  const f = document.querySelector('.footer'), a = document.querySelector('.footer a');
  const bg = getComputedStyle(f).backgroundColor;
  return { bg, dark: lum(bg) < 0.1,
           text: +ratio(getComputedStyle(f).color, bg).toFixed(1),
           link: +ratio(getComputedStyle(a).color, bg).toFixed(1) };
});
ok('footer: genuinely dark, with text and link clearing AAA on it',
   fc.dark && fc.text >= 7 && fc.link >= 7, JSON.stringify(fc));

for (const path of ['/', '/rsvp', '/memories', '/share']) {
  await p.goto(B + path, { waitUntil: 'load' });
  const adminLinks = await p.evaluate(() => document.querySelectorAll('a[href*="admin"]').length);
  ok(`${path}: no link to the family page`, adminLinks === 0, 'found ' + adminLinks);
}
// but the page itself is still reachable by typing the address
ok('/admin is still reachable directly', (await p.request.get(B + '/admin')).status() === 200);

/* ---- enlarged text still fits the screen ----
   Someone who has set their browser to large type is exactly who this site is
   for, and it is the case most easily broken: at 200% the page was running off
   the right edge on a phone, which means pinching and scrolling sideways to
   read a date. Nothing here may scroll horizontally at any of these. */
for (const [label, width, root] of [['default text', 320, null],
                                    ['text +50%',    320, '187.5%'],
                                    ['text +100%',   375, '250%']]) {
  for (const path of ['/', '/memories', '/share', '/rsvp']) {
    const zoomed = await b.newContext({ viewport: { width, height: 700 } });
    const zp = await zoomed.newPage();
    await zp.goto(B + path, { waitUntil: 'load' });
    if (root) await zp.evaluate(r => { document.documentElement.style.fontSize = r; }, root);
    await zp.evaluate(() => document.fonts.ready);
    const spill = await zp.evaluate(() => {
      const w = window.innerWidth;
      const worst = [...document.querySelectorAll('body *')]
        .filter(el => el.children.length === 0 && el.getBoundingClientRect().width > 0)
        .map(el => ({ by: Math.round(el.getBoundingClientRect().right - w),
                      what: el.tagName.toLowerCase() + ' "' + el.textContent.trim().slice(0, 24) + '"' }))
        .filter(x => x.by > 1).sort((a, c) => c.by - a.by)[0];
      return { over: document.documentElement.scrollWidth - w, worst };
    });
    ok(`${path} at ${width}px, ${label}: nothing runs off the side`,
       spill.over <= 0, spill.worst ? `${spill.worst.what} by ${spill.worst.by}px` : `${spill.over}px`);
    await zoomed.close();
  }
}

/* Not overflowing is not the same as being readable. When the tickbox chrome
   grew with the type it squeezed the column until whole words broke in half —
   "The ceremon / y" — which the overflow check above cannot see, because
   nothing was hanging off the edge. So: does the longest word still fit on a
   line of its own? */
{
  const tight = await b.newContext({ viewport: { width: 375, height: 700 } });
  const tp = await tight.newPage();
  await tp.goto(B + '/rsvp', { waitUntil: 'load' });
  await tp.evaluate(() => { document.documentElement.style.fontSize = '250%'; });
  await tp.evaluate(() => document.fonts.ready);
  const room = await tp.evaluate(() => {
    const worst = [...document.querySelectorAll('.choice__title, .choice__desc')].map(el => {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;white-space:nowrap;visibility:hidden';
      probe.style.font = getComputedStyle(el).font;
      const longest = el.textContent.trim().split(/\s+/).sort((a, c) => c.length - a.length)[0] || '';
      probe.textContent = longest;
      document.body.appendChild(probe);
      const need = probe.getBoundingClientRect().width;
      probe.remove();
      return { word: longest, need: Math.round(need), have: Math.round(el.getBoundingClientRect().width) };
    }).filter(x => x.need > x.have);
    return worst[0] || null;
  });
  ok('at 200% text, the tickbox wording still has room for a whole word',
     room === null, room ? `"${room.word}" needs ${room.need}px, has ${room.have}px` : 'every word fits');
  await tight.close();
}

await b.close();
finish();
