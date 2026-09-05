/* Approve, hide, make private, or delete a single message. */

import { json, bad, isAdmin, dbMissing } from '../../../_lib/util.js';

export async function onRequestPost({ params, request, env }) {
  const db = env.DB;
  if (!db) return dbMissing();
  if (!(await isAdmin(request, env))) return bad('Please sign in.', 401);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return bad('That message could not be found.', 404);

  let action;
  try {
    action = (await request.json())?.action;
  } catch (err) {
    return bad('We could not read that request.');
  }

  let statement;
  switch (action) {
    case 'approve':       // show it in the public guestbook
      statement = db.prepare(`UPDATE entries SET visibility = 'public', approved = 1 WHERE id = ?`);
      break;
    case 'unapprove':     // take it back out of the guestbook
      statement = db.prepare(`UPDATE entries SET approved = 0 WHERE id = ?`);
      break;
    case 'make_private':  // keep it, but only for the family
      statement = db.prepare(`UPDATE entries SET visibility = 'private', approved = 0 WHERE id = ?`);
      break;
    case 'delete':
      statement = db.prepare(`DELETE FROM entries WHERE id = ?`);
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
