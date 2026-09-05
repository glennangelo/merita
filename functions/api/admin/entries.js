/* Every message, grouped for the family's moderation page.
   - pending: public messages waiting to be approved
   - private: messages the writer asked to keep between themselves and the family
   - public:  messages already live in the guestbook                        */

import { json, bad, isAdmin, dbMissing } from '../../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return dbMissing();
  if (!(await isAdmin(request, env))) return bad('Please sign in.', 401);

  const { results } = await db.prepare(
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
