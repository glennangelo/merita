/* Shared plumbing for the test suites.

   Every suite prints one "PASS" or "FAIL" line per check and ends with a
   count. tests/run.mjs runs them all and adds the counts up. A suite can also
   be run on its own — `node tests/forms.mjs` — while working on one page. */

/* Playwright is a devDependency, so `npm install` puts it in node_modules. It
   is also commonly installed globally; falling back to that saves anyone
   reading this from a confusing "cannot find package" before they have run
   the install. */
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    for (const path of ['/opt/node22/lib/node_modules/playwright/index.mjs',
                        '/usr/lib/node_modules/playwright/index.mjs',
                        '/usr/local/lib/node_modules/playwright/index.mjs']) {
      try { return await import(path); } catch (e) { /* try the next one */ }
    }
    throw new Error(
      'Playwright is not installed. Run "npm install" first, then "npx playwright install chromium".'
    );
  }
}

export const { chromium } = await loadPlaywright();

export const B  = process.env.TEST_URL || 'http://127.0.0.1:8788';
export const PW = process.env.TEST_PASSWORD || 'test-password-1234';

let passed = 0, failed = 0;

export function ok(label, condition, detail = '') {
  if (condition) passed++; else failed++;
  console.log((condition ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  — ' + detail : ''));
}

/* Printed last, and read by the runner. A failing suite also sets a non-zero
   exit code, so `npm test` fails in the ordinary way. */
export function finish(note = '') {
  if (note) console.log(note);
  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

/* Empty the database over the site's own admin API, so a suite starts from a
   known state instead of inheriting whatever the last run left behind.
   Leftovers used to make the reply totals climb between runs, which looks
   exactly like a real counting bug and wasted a long time once.

   The session cookie is rightly marked Secure. Chromium's renderer treats
   127.0.0.1 as a trustworthy origin and keeps it, but Playwright's request
   context does not — it drops the cookie and every call comes back 401 — so
   the cookie is carried by hand here rather than weakening the real header. */
export async function reset(request, base = B, password = PW) {
  const login = await request.post(base + '/api/admin/login', { data: { password } });
  if (!login.ok()) throw new Error('reset: could not sign in — ' + login.status());

  const cookie = (await login.headersArray())
    .filter(h => h.name.toLowerCase() === 'set-cookie')
    .map(h => h.value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('reset: the login sent no session cookie');
  const headers = { Cookie: cookie };

  const asJson = async (res) => {
    if (!res.ok()) throw new Error('reset: ' + res.status() + ' from ' + res.url());
    return res.json();
  };

  const { rsvps = [] } = await asJson(await request.get(base + '/api/admin/rsvps', { headers }));
  for (const r of rsvps) {
    await request.post(`${base}/api/admin/rsvps/${r.id}`, { headers, data: { action: 'delete' } });
  }

  const e = await asJson(await request.get(base + '/api/admin/entries', { headers }));
  const all = [...(e.pending || []), ...(e.private || []), ...(e.public || [])];
  for (const entry of all) {
    await request.post(`${base}/api/admin/entries/${entry.id}`, { headers, data: { action: 'delete' } });
  }

  await request.post(base + '/api/admin/logout', { headers });
  console.log(`reset  cleared ${rsvps.length} replies, ${all.length} memories`);
}

/* A signed-in request context, for the checks that talk to the admin API
   directly rather than through the page. */
export async function adminHeaders(request, base = B, password = PW) {
  const login = await request.post(base + '/api/admin/login', { data: { password } });
  if (!login.ok()) throw new Error('sign in failed: ' + login.status());
  const cookie = (await login.headersArray())
    .filter(h => h.name.toLowerCase() === 'set-cookie')
    .map(h => h.value.split(';')[0]).join('; ');
  return { Cookie: cookie };
}
