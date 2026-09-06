/* Memories: reading the ones the family has approved, receiving new ones, and
   serving the photographs attached to them. */

import { json, bad, tidyText, toBytes, isAdmin, senderKey, overLimit } from './lib.js';

const MAX_NAME    = 80;
const MAX_MESSAGE = 2000;
const MAX_PHOTO   = 1000 * 1024;   // ~1 MB, after the browser has shrunk it to
                                   // 1200 pixels. D1 refuses a row over 2,000,000
                                   // bytes and the row holds the message too.
const PER_SENDER  = 8;             // memories from one visitor in ten minutes
const PER_SITE    = 200;           // memories from everyone in five minutes

/* GET /api/entries — the messages the family has approved for the website. */
export async function listEntries(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, message, photo_alt, photo_w, photo_h, created_at,
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
  if (String(form.get('subject') || '').trim() !== '') return json({ ok: true });

  const name       = tidyText(form.get('name'), MAX_NAME);
  const message    = tidyText(form.get('message'), MAX_MESSAGE);
  const visibility = form.get('visibility') === 'private' ? 'private' : 'public';

  if (!name)    return bad('Please add your name.');
  if (!message) return bad('Please write a message.');

  const sender = await senderKey(request, env);
  if (await overLimit(env, 'entries', sender, PER_SENDER, PER_SITE)) {
    return bad('That is several messages in a few minutes. Please wait a little, ' +
               'then send the rest.', 429);
  }

  let photoBytes = null;
  let photoType  = null;
  const photo = form.get('photo');
  // The browser measured the picture after shrinking it. Recording the shape
  // lets the memories page hold the right amount of room before the picture
  // arrives, so the page does not jump under someone's thumb as they read.
  const photoW = wholeNumber(form.get('photo_w'));
  const photoH = wholeNumber(form.get('photo_h'));
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
    `INSERT INTO entries
       (name, message, visibility, approved, photo, photo_type, photo_w, photo_h, sender)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`
  ).bind(name, message, visibility, photoBytes, photoType,
         photoBytes ? photoW : null, photoBytes ? photoH : null, sender).run();

  return json({ ok: true }, 201);
}

/* A dimension sent by the browser: a plain whole number within sane bounds,
   or nothing at all. Never trusted enough to be used for anything but the
   width and height attributes on an image. */
function wholeNumber(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
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
