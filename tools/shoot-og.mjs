/* Builds the share card — the picture people see when the link is pasted into
   WhatsApp, Facebook or a text message.
 *
 * It photographs public/og-card.html at exactly 1200x630, the size every one
 * of those services expects, so the card is set in the site's own typefaces
 * rather than drawn by hand. Run it after changing the portrait, the name or
 * the dates:
 *
 *     npm start          (in one terminal, so the page can be loaded)
 *     npm run og         (in another)
 *
 * The result is written to public/assets/og.jpg, which the <meta> tags at the
 * top of index.html point at. */

import { chromium } from 'playwright';

const FROM = process.env.TEST_URL || 'http://127.0.0.1:8788';
const TO   = 'public/assets/og.jpg';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1
});

const res = await page.goto(`${FROM}/og-card.html`, { waitUntil: 'networkidle' });
if (!res || !res.ok()) {
  console.error(`Could not load ${FROM}/og-card.html — is "npm start" running?`);
  await browser.close();
  process.exit(1);
}

/* Without this the card can be shot while the browser is still drawing the
   name in a fallback face. */
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

await page.screenshot({ path: TO, type: 'jpeg', quality: 88 });
await browser.close();
console.log(`Share card written to ${TO} (1200x630).`);
