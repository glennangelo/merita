/* The check to run last, before the address is sent to anybody.

   Everything here is EXPECTED TO FAIL while the site is still a template —
   that is the point of it. It fails until the family's own words are in, so
   that nobody can put the link in a group chat while a page still says
   [Full Name]. It is not part of `npm test` for that reason; run it with
   `npm run check` when you think you are ready. */

import { chromium, ok, finish, B } from './helpers.mjs';

const b = await chromium.launch();
const p = await (await b.newContext()).newPage();

const PAGES = ['/', '/memories', '/share', '/rsvp', '/admin'];

/* Anything still in [square brackets] is a placeholder nobody has filled in. */
for (const path of PAGES) {
  await p.goto(B + path, { waitUntil: 'load' });
  const left = await p.evaluate(() => {
    const found = new Set();
    const walk = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (const m of n.textContent.matchAll(/\[[^\]\n]{2,40}\]/g)) found.add(m[0]);
    }
    // Attributes carry them too: titles, descriptions, the portrait's alt text,
    // and the addresses of the fundraising pages — a link still reading
    // [JustGiving address] looks finished on the page and leads nowhere, which
    // is the one placeholder a visitor would find by clicking rather than by
    // reading.
    for (const el of document.querySelectorAll('[content], [alt], [title], [href]')) {
      for (const a of ['content', 'alt', 'title', 'href']) {
        const v = el.getAttribute(a);
        if (v) for (const m of v.matchAll(/\[[^\]\n]{2,40}\]/g)) found.add(m[0]);
      }
    }
    return [...found];
  });
  ok(`${path}: every placeholder has been replaced`, left.length === 0, left.join(' '));
}

/* The share card, which is what people actually see when the link is pasted. */
await p.goto(B + '/', { waitUntil: 'load' });
const card = await p.evaluate(() => {
  const meta = (n) => document.querySelector(`meta[property="${n}"]`)?.content || '';
  return {
    url: meta('og:url'),
    image: meta('og:image'),
    canonical: document.querySelector('link[rel=canonical]')?.href || ''
  };
});
ok('the share card points at the real address, not example.com',
   !!card.url && !/example\.com/.test(card.url) && card.url.startsWith('https://'), card.url);
ok('the share card names a picture, written out in full',
   card.image.startsWith('https://'), card.image);
ok('the page says which address is the real one', card.canonical.startsWith('https://'), card.canonical);

const picture = await p.request.get(card.image.replace(/^https:\/\/[^/]+/, B));
ok('and that picture actually exists', picture.ok(), 'status ' + picture.status());

/* The two fundraising pages. Both must be real addresses at JustGiving, not
   the placeholders the template ships with — the section reads as an
   invitation to give, so a link leading nowhere costs a donation. */
const giving = await p.evaluate(() =>
  [...document.querySelectorAll('.give__act a')].map(a => a.getAttribute('href')));
ok('both fundraising pages have a real address',
   giving.length === 2 && giving.every(h => /^https:\/\/(www\.)?justgiving\.com\//.test(h)),
   giving.join('  '));

/* The portrait, which starts as a drawn placeholder. */
const portrait = await p.evaluate(() => {
  const i = document.querySelector('.portrait');
  return { src: i.getAttribute('src'), alt: i.getAttribute('alt') };
});
ok('a real photograph has replaced the drawn stand-in',
   !/portrait\.svg$/.test(portrait.src), portrait.src);

/* The dates a screen reader and a search engine read, rather than the ones on
   the page — these are easy to change in one place and forget in the other. */
const dates = await p.evaluate(() =>
  [...document.querySelectorAll('.hero__dates time')].map(t => t.getAttribute('datetime')));
ok('the dates behind the dates have been set too',
   dates.length === 2 && !dates.includes('1234-01-01') && !dates.includes('2026-01-01'),
   dates.join(' to '));

await b.close();
finish('\nAnything failing above still needs the family\'s own words.');
