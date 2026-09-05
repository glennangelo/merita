/* The whole back end of the memorial site, in one Cloudflare Worker.
 *
 * Cloudflare serves everything in public/ directly as static files. This
 * Worker is only reached for addresses that are not a file — in practice the
 * /api/... calls the pages make. Anything else is handed back to the
 * static files so it 404s exactly as a plain website would.
 */

import { json, bad, dbMissing } from './lib.js';
import { listEntries, createEntry, getPhoto } from './memories.js';
import { login, logout, listAll, moderate } from './admin.js';
import { createRsvp, listRsvps, deleteRsvp } from './rsvp.js';

/* Each route is [method, path pattern, handler]. A ":id" segment is passed to
   the handler as a number. Kept deliberately plain — there is no router
   library to learn, and the whole table fits on one screen. */
const ROUTES = [
  ['GET',  '/api/entries',            (req, env)     => listEntries(req, env)],
  ['POST', '/api/entries',            (req, env)     => createEntry(req, env)],
  ['GET',  '/api/photo/:id',          (req, env, id) => getPhoto(req, env, id)],
  ['POST', '/api/admin/login',        (req, env)     => login(req, env)],
  ['POST', '/api/admin/logout',       ()             => logout()],
  ['GET',  '/api/admin/entries',      (req, env)     => listAll(req, env)],
  ['POST', '/api/admin/entries/:id',  (req, env, id) => moderate(req, env, id)],
  ['POST', '/api/rsvp',               (req, env)     => createRsvp(req, env)],
  ['GET',  '/api/admin/rsvps',        (req, env)     => listRsvps(req, env)],
  ['POST', '/api/admin/rsvps/:id',    (req, env, id) => deleteRsvp(req, env, id)]
];

function match(pattern, path) {
  const want = pattern.split('/');
  const got  = path.split('/');
  if (want.length !== got.length) return null;

  let id = null;
  for (let i = 0; i < want.length; i++) {
    if (want[i] === ':id') {
      if (!/^\d{1,15}$/.test(got[i])) return null;
      id = Number(got[i]);
    } else if (want[i] !== got[i]) {
      return null;
    }
  }
  return { id };
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    // Not an API call: let the static files answer, as they normally would.
    if (!path.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    // Nothing here works without the database. Say so plainly rather
    // than failing with a stack trace nobody can act on.
    if (!env.DB) return dbMissing();

    const allowed = [];
    for (const [method, pattern, handler] of ROUTES) {
      const found = match(pattern, path);
      if (!found) continue;
      allowed.push(method);
      if (method === request.method) {
        try {
          return await handler(request, env, found.id);
        } catch (err) {
          console.error('Request failed:', path, err);
          return bad('Something went wrong at our end. Please try again.', 500);
        }
      }
    }

    if (allowed.length) {
      return json({ error: `${request.method} is not supported here.` }, 405,
                  { Allow: [...new Set(allowed)].join(', ') });
    }
    return bad('Not found.', 404);
  }
};
