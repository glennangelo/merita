/* Memories: reading the ones the family has approved, receiving new ones, and
   serving the photographs attached to them. */

import { json, bad, tidyText, toBytes, isAdmin } from './lib.js';

const MAX_NAME    = 80;
const MAX_MESSAGE = 2000;
const MAX_ALT     = 200;
const MAX_PHOTO   = 1500 * 1024;   // ~1.5 MB, after the browser has shrunk it.
                                   // D1 refuses a row over 2,000,000 bytes and the
                                   // row holds the message too, so this leaves room.
const RATE_WINDOW = 5;             // minutes
const RATE_LIMIT  = 40;            // new messages allowed in that window

/* GET /api/entries — the messages the family has approved for the website. */
export async function listEntries(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, message, photo_alt, created_at,
            CASE WHEN photo IS NULL THEN 0 ELSE 1 END AS has_photo
       FROM entries
      WHERE visibility = 'public' AND approved = 1
      ORDER BY created_at DESC, id DESC
      LIMIT 500`
  ).all();

  // Deliberately not cached: when the family approves a message they open the
  // memories straight away to check it, and a stale page looks like a fault.
  return json({ entries: results ?? [] });
}

/* POST /api/entries — a visitor leaving a new message. */
export async function createEntry(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return bad('We could not read that submission.');
  }

  // Spam trap: a real visitor never sees this field, so anything in it is a bot.
  // Answer as though it worked — a bot told "rejected" simply tries again.
  if (String(form.get('website') || '').trim() !== '') return json({ ok: true });

  const name       = tidyText(form.get('name'), MAX_NAME);
  const message    = tidyText(form.get('message'), MAX_MESSAGE);
  const altText    = tidyText(form.get('photo_alt'), MAX_ALT);
  const visibility = form.get('visibility') === 'private' ? 'private' : 'public';

  if (!name)    return bad('Please add your name.');
  if (!message) return bad('Please write a message.');

  // A light global limit: enough headroom for a busy day, but a flood is stopped.
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM entries WHERE created_at > datetime('now', ?)`
  ).bind(`-${RATE_WINDOW} minutes`).first();
  if ((recent?.n ?? 0) >= RATE_LIMIT) {
    return bad('Very busy just now. Please try again in a few minutes.', 429);
  }

  let photoBytes = null;
  let photoType  = null;
  const photo = form.get('photo');
  if (photo && typeof photo === 'object' && typeof photo.arrayBuffer === 'function' && photo.size > 0) {
    if (photo.size > MAX_PHOTO) {
      return bad('That photograph is too large. Please choose a smaller picture.', 413);
    }
    const type = String(photo.type || '');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) {
      return bad('Photographs must be a JPEG, PNG, WebP or GIF picture.', 415);
    }
    photoBytes = await photo.arrayBuffer();
    photoType  = type;
  }

  await env.DB.prepare(
    `INSERT INTO entries (name, message, visibility, approved, photo, photo_type, photo_alt)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  ).bind(name, message, visibility, photoBytes, photoType, photoBytes ? altText : null).run();

  return json({ ok: true }, 201);
}

/* GET /api/photo/:id
   A picture is public only when its message is public and approved; anything
   else is visible to a signed-in family member alone. */
export async function getPhoto(request, env, id) {
  if (!Number.isInteger(id) || id < 1) return bad('Not found.', 404);

  const row = await env.DB.prepare(
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
