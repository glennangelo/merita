/* Replies to the invitation: who is coming, how many, and to which part of
   the day. Nothing here is ever shown publicly — it is for the family alone. */

import { json, bad, tidyText, isAdmin } from './lib.js';

const MAX_NAME    = 80;
const MAX_CONTACT = 80;
const MAX_PARTY   = 20;
const RATE_WINDOW = 5;    // minutes
const RATE_LIMIT  = 40;   // replies allowed in that window

/* POST /api/rsvp — someone letting the family know. */
export async function createRsvp(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return bad('We could not read that reply.');
  }

  // Spam trap: a real visitor never sees this field.
  if (String(body?.website || '').trim() !== '') return json({ ok: true });

  const name    = tidyText(body?.name, MAX_NAME);
  const contact = tidyText(body?.contact, MAX_CONTACT);
  const ceremony  = body?.ceremony  ? 1 : 0;
  const reception = body?.reception ? 1 : 0;

  if (!name) return bad('Please add your name.');
  if (!ceremony && !reception) return bad('Please choose which part of the day you can come to.');

  const party = Number(body?.party_size);
  if (!Number.isInteger(party) || party < 1 || party > MAX_PARTY) {
    return bad(`Please give a number of people between 1 and ${MAX_PARTY}.`);
  }

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rsvps WHERE created_at > datetime('now', ?)`
  ).bind(`-${RATE_WINDOW} minutes`).first();
  if ((recent?.n ?? 0) >= RATE_LIMIT) {
    return bad('Very busy just now. Please try again in a few minutes.', 429);
  }

  await env.DB.prepare(
    `INSERT INTO rsvps (name, party_size, ceremony, reception, contact)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(name, party, ceremony, reception, contact || null).run();

  return json({ ok: true }, 201);
}

/* GET /api/admin/rsvps — the whole list, with the totals the family needs. */
export async function listRsvps(request, env) {
  if (!(await isAdmin(request, env))) return bad('Please sign in.', 401);

  const { results } = await env.DB.prepare(
    `SELECT id, name, party_size, ceremony, reception, contact, created_at
       FROM rsvps
      ORDER BY created_at DESC, id DESC`
  ).all();

  const rsvps = results ?? [];
  const heads = (which) => rsvps.reduce((n, r) => n + (r[which] ? r.party_size : 0), 0);

  return json({
    rsvps,
    totals: {
      replies:   rsvps.length,
      ceremony:  heads('ceremony'),
      reception: heads('reception')
    }
  });
}

/* POST /api/admin/rsvps/:id — only one thing to do: remove a reply. */
export async function deleteRsvp(request, env, id) {
  if (!(await isAdmin(request, env))) return bad('Please sign in.', 401);
  if (!Number.isInteger(id) || id < 1) return bad('That reply could not be found.', 404);

  let action;
  try {
    action = (await request.json())?.action;
  } catch (err) {
    return bad('We could not read that request.');
  }
  if (action !== 'delete') return bad('That is not something we can do to a reply.');

  const result = await env.DB.prepare(`DELETE FROM rsvps WHERE id = ?`).bind(id).run();
  if (result.meta && result.meta.changes === 0) {
    return bad('That reply could not be found.', 404);
  }
  return json({ ok: true });
}
