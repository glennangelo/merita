/* The family's side: signing in, reading everything, and moderating. */

import {
  json, bad, isAdmin, checkPassword, createSession, sessionCookie, SESSION_HOURS
} from './lib.js';

/* POST /api/admin/login */
export async function login(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return bad('No administration password has been set yet. See README.md, step 5.', 503);
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

  return json({ ok: true }, 200, {
    'Set-Cookie': sessionCookie(await createSession(env), SESSION_HOURS * 3600)
  });
}

/* POST /api/admin/logout */
export async function logout() {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

/* GET /api/admin/entries — every message, grouped for the moderation page.
   - pending: public messages waiting to be approved
   - private: messages the writer asked to keep between themselves and the family
   - public:  memories already shared on the website                          */
export async function listAll(request, env) {
  if (!(await isAdmin(request, env))) return bad('Please sign in.', 401);

  const { results } = await env.DB.prepare(
    `SELECT id, name, message, visibility, approved, photo_alt, created_at,
            CASE WHEN photo IS NULL THEN 0 ELSE 1 END AS has_photo
       FROM entries
      ORDER BY created_at DESC, id DESC`
  ).all();

  const all = results ?? [];
  return json({
    pending: all.filter((e) => e.visibility === 'public' && e.approved !== 1),
    private: all.filter((e) => e.visibility === 'private'),
    public:  all.filter((e) => e.visibility === 'public' && e.approved === 1)
  });
}

/* POST /api/admin/entries/:id — approve, hide, make private, or delete. */
export async function moderate(request, env, id) {
  if (!(await isAdmin(request, env))) return bad('Please sign in.', 401);
  if (!Number.isInteger(id) || id < 1) return bad('That message could not be found.', 404);

  let action;
  try {
    action = (await request.json())?.action;
  } catch (err) {
    return bad('We could not read that request.');
  }

  let statement;
  switch (action) {
    case 'approve':       // share it publicly
      statement = env.DB.prepare(`UPDATE entries SET visibility = 'public', approved = 1 WHERE id = ?`);
      break;
    case 'unapprove':     // take it back off the website
      statement = env.DB.prepare(`UPDATE entries SET approved = 0 WHERE id = ?`);
      break;
    case 'make_private':  // keep it, but only for the family
      statement = env.DB.prepare(`UPDATE entries SET visibility = 'private', approved = 0 WHERE id = ?`);
      break;
    case 'delete':
      statement = env.DB.prepare(`DELETE FROM entries WHERE id = ?`);
      break;
    default:
      return bad('That is not something we can do to a message.');
  }

  const result = await statement.bind(id).run();
  if (result.meta && result.meta.changes === 0) {
    return bad('That message could not be found.', 404);
  }
  return json({ ok: true });
}
