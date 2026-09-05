/* Shared helpers for the guestbook API.
   Directories beginning with "_" are not routed by Cloudflare Pages, so
   nothing in here is reachable from the web. */

export const COOKIE = 'memorial_admin';
export const SESSION_HOURS = 12;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

export function bad(message, status = 400) {
  return json({ error: message }, status);
}

/* --- Sessions ------------------------------------------------------------
   A signed token of the form "<expiry>.<signature>". Nothing secret travels
   in the cookie, and it cannot be forged without the signing key. The key is
   derived from the admin password unless SESSION_SECRET is set, so changing
   the password automatically signs everyone out.                          */

function keyMaterial(env) {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(env, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function createSession(env) {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  return `${expires}.${await hmac(env, String(expires))}`;
}

/* Compares in constant time so an attacker cannot learn the value one
   character at a time by measuring how long the check takes. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isAdmin(request, env) {
  if (!keyMaterial(env)) return false;

  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!match) return false;

  const [expires, signature] = decodeURIComponent(match[1]).split('.');
  if (!expires || !signature) return false;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;

  return safeEqual(signature, await hmac(env, expires));
}

export async function checkPassword(env, supplied) {
  const expected = env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  // Hash both sides first so the comparison length never leaks the real length.
  const digest = async (value) =>
    hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return safeEqual(await digest(String(supplied ?? '')), await digest(expected));
}

export function sessionCookie(value, maxAge) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

/* --- Misc ---------------------------------------------------------------- */

/* Strips control characters and collapses runs of blank lines, so a pasted
   message cannot stretch the page or hide content inside itself. */
export function tidyText(value, limit) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);
}

/* D1 hands back a BLOB as an ArrayBuffer or as an array of byte values,
   depending on the driver version. Normalise both to a Uint8Array. */
export function toBytes(blob) {
  if (!blob) return null;
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
  if (ArrayBuffer.isView(blob)) return new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
  if (Array.isArray(blob)) return new Uint8Array(blob);
  return null;
}

/* A clear message beats a stack trace if the database was never bound. */
export function dbMissing() {
  return json({ error: 'The guestbook database is not connected yet. See README.md, step 3.' }, 503);
}
