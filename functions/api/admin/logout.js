/* Signs the family member out by clearing the session cookie. */

import { json, sessionCookie } from '../../_lib/util.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
