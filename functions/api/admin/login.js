/* Signs a family member in and hands back a short-lived session cookie. */

import { json, bad, checkPassword, createSession, sessionCookie, SESSION_HOURS } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) {
    return bad('No administration password has been set yet. See README.md, step 4.', 503);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return bad('We could not read that request.');
  }

  if (!(await checkPassword(env, body?.password))) {
    // A deliberate pause makes guessing passwords in bulk impractical.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return bad('That password was not right.', 401);
  }

  const token = await createSession(env);
  return json({ ok: true }, 200, {
    'Set-Cookie': sessionCookie(token, SESSION_HOURS * 3600)
  });
}
