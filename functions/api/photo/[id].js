/* Serves a guestbook photograph.
   A picture is public only when its message is public and approved; anything
   else is visible to a signed-in family member alone. */

import { isAdmin, toBytes, dbMissing, bad } from '../../_lib/util.js';

export async function onRequestGet({ params, request, env }) {
  const db = env.DB;
  if (!db) return dbMissing();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return bad('Not found.', 404);

  const row = await db.prepare(
    `SELECT photo, photo_type, visibility, approved FROM entries WHERE id = ?`
  ).bind(id).first();

  if (!row || !row.photo) return bad('Not found.', 404);

  const isPublic = row.visibility === 'public' && row.approved === 1;
  if (!isPublic && !(await isAdmin(request, env))) return bad('Not found.', 404);

  const bytes = toBytes(row.photo);
  if (!bytes) return bad('Not found.', 404);

  return new Response(bytes, {
    headers: {
      'Content-Type': row.photo_type || 'image/jpeg',
      'Content-Length': String(bytes.byteLength),
      // Cached in the visitor's own browser only, never in a shared cache: if
      // the family hides or deletes a picture it must disappear for everyone
      // straight away, not linger at the edge for hours.
      'Cache-Control': isPublic ? 'private, max-age=3600' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline'
    }
  });
}
