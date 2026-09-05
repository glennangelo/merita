/* Family administration: read private messages, approve public ones. */
(function () {
  var loginView   = document.getElementById('login-view');
  var adminView   = document.getElementById('admin-view');
  var loginForm   = document.getElementById('login-form');
  var loginBtn    = document.getElementById('login-btn');
  var loginStatus = document.getElementById('login-status');
  var password    = document.getElementById('password');
  var adminStatus = document.getElementById('admin-status');
  var list        = document.getElementById('entries');
  var tabs        = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var logoutBtn   = document.getElementById('logout-btn');

  var totalsLine = document.getElementById('rsvp-totals');

  var filter = 'pending';
  var cache  = { pending: [], private: [], public: [], rsvp: [] };
  var totals = { replies: 0, ceremony: 0, reception: 0 };

  /* ---------- helpers ---------- */

  function say(box, tone, headline, detail) {
    box.dataset.tone = tone;
    box.innerHTML = '';
    if (headline) {
      var strong = document.createElement('strong');
      strong.textContent = headline;
      box.appendChild(strong);
    }
    if (detail) box.appendChild(document.createTextNode(detail));
  }

  function formatDate(iso) {
    var date = new Date(iso.replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? '' : 'Z'));
    if (isNaN(date)) return '';
    return date.toLocaleString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  async function api(path, options) {
    var response = await fetch(path, Object.assign({ credentials: 'same-origin' }, options));
    if (response.status === 401) { showLogin('Your session has ended. Please sign in again.'); throw new Error('unauthorised'); }
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }

  /* ---------- views ---------- */

  function showLogin(note) {
    adminView.hidden = true;
    loginView.hidden = false;
    if (note) say(loginStatus, 'error', note, '');
    password.value = '';
  }

  function showAdmin() {
    loginView.hidden = true;
    adminView.hidden = false;
    load();
  }

  /* ---------- rendering ---------- */

  var TAG = {
    pending: ['tag--pending', 'Waiting for approval'],
    private: ['tag--private', 'Private to the family'],
    public:  ['tag--live',    'Shared publicly']
  };

  function render(entry, index) {
    var item = document.createElement('li');
    item.className = 'entry';

    var tag = document.createElement('span');
    tag.className = 'tag ' + TAG[filter][0];
    tag.textContent = TAG[filter][1];
    item.appendChild(tag);

    if (entry.has_photo) {
      var img = document.createElement('img');
      img.className = 'entry__photo';
      img.src = '/api/photo/' + entry.id;
      img.alt = entry.photo_alt || ('A photograph shared by ' + entry.name + '.');
      // The first picture is what a visitor sees straight away, so it is
      // fetched at once; the rest wait until they are scrolled towards.
      img.loading = index === 0 ? 'eager' : 'lazy';
      item.appendChild(img);
    }

    var body = document.createElement('p');
    body.className = 'entry__message';
    body.textContent = entry.message;
    item.appendChild(body);

    // No date, matching the public page. Everything is newest first anyway.
    var by = document.createElement('p');
    by.className = 'entry__by';
    var who = document.createElement('strong');
    who.textContent = entry.name;
    by.appendChild(who);
    item.appendChild(by);

    var actions = document.createElement('div');
    actions.className = 'actions';

    if (filter === 'pending') {
      actions.appendChild(button('Approve', 'btn', function () {
        act(entry, 'approve', 'Approved. It is now with the memories.');
      }));
      actions.appendChild(button('Keep private', 'btn btn--ghost', function () {
        act(entry, 'make_private', 'Moved to the private messages.');
      }));
    } else if (filter === 'public') {
      actions.appendChild(button('Hide', 'btn btn--ghost', function () {
        act(entry, 'unapprove', 'Hidden. It is back in the waiting list.');
      }));
    } else {
      actions.appendChild(button('Publish', 'btn btn--ghost', function () {
        if (!confirm('Share this publicly?\n\n' + entry.name +
                     ' asked for it to stay private, so please only do this with their permission.')) return;
        act(entry, 'approve', 'Now shared publicly.');
      }));
    }

    actions.appendChild(button('Delete', 'btn btn--danger', function () {
      if (!confirm('Permanently delete what ' + entry.name + ' wrote?\n\nThis cannot be undone.')) return;
      act(entry, 'delete', 'The message was deleted.');
    }));

    item.appendChild(actions);
    return item;
  }

  /* A reply to the invitation: who, how many, and to which part of the day. */
  function renderRsvp(entry) {
    var item = document.createElement('li');
    item.className = 'entry';

    var who = document.createElement('p');
    who.className = 'entry__by';
    var strong = document.createElement('strong');
    strong.textContent = entry.name;
    who.appendChild(strong);
    item.appendChild(who);

    var facts = document.createElement('p');
    facts.className = 'rsvp__facts';
    var parts = entry.ceremony && entry.reception ? 'ceremony and celebration'
              : entry.ceremony ? 'ceremony only'
              : 'celebration only';
    facts.textContent = (entry.party_size === 1 ? '1 person' : entry.party_size + ' people') +
                        ' — ' + parts;
    item.appendChild(facts);

    if (entry.contact) {
      var contact = document.createElement('p');
      contact.className = 'rsvp__contact';
      contact.textContent = entry.contact;
      item.appendChild(contact);
    }

    var when = document.createElement('p');
    when.className = 'entry__by';
    when.textContent = formatDate(entry.created_at);
    item.appendChild(when);

    var actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(button('Delete', 'btn btn--danger', function () {
      if (!confirm('Delete the reply from ' + entry.name + '?')) return;
      act(entry, 'delete', 'The reply was deleted.', '/api/admin/rsvps/');
    }));
    item.appendChild(actions);

    return item;
  }

  function button(label, className, onClick) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = className + ' btn--small';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  var EMPTY = {
    pending: ['Nothing waiting.', 'New public memories appear here for you to read first.'],
    private: ['No private memories.', 'Memories sent privately to the family appear here.'],
    public:  ['Nothing shared yet.', 'Approve a waiting memory and it will show up here.'],
    rsvp:    ['Nobody has replied yet.', 'Replies to the invitation appear here.']
  };

  function draw() {
    var entries = cache[filter];
    var isRsvp = filter === 'rsvp';

    totalsLine.hidden = !isRsvp || !entries.length;
    if (isRsvp && entries.length) {
      totalsLine.textContent =
        (totals.replies === 1 ? '1 reply' : totals.replies + ' replies') + ' — ' +
        totals.ceremony + ' at the ceremony, ' + totals.reception + ' at the celebration';
    }

    if (!entries.length) {
      var box = document.createElement('li');
      box.className = 'empty';
      var h = document.createElement('p');
      var strong = document.createElement('strong');
      strong.textContent = EMPTY[filter][0];
      h.appendChild(strong);
      var p = document.createElement('p');
      p.textContent = EMPTY[filter][1];
      box.append(h, p);
      list.replaceChildren(box);
    } else {
      list.replaceChildren.apply(list, entries.map(isRsvp ? renderRsvp : render));
    }

    tabs.forEach(function (tab) {
      var key = tab.dataset.filter;
      tab.setAttribute('aria-selected', String(key === filter));
      tab.querySelector('[data-count]').textContent = '(' + cache[key].length + ')';
    });
    list.setAttribute('aria-labelledby', 'tab-' + filter);
  }

  /* ---------- data ---------- */

  async function load(quiet) {
    if (!quiet) say(adminStatus, 'busy', 'Loading…', '');
    try {
      var both = await Promise.all([api('/api/admin/entries'), api('/api/admin/rsvps')]);
      var data = both[0], replies = both[1];
      cache = {
        pending: data.pending || [], private: data.private || [], public: data.public || [],
        rsvp: replies.rsvps || []
      };
      totals = replies.totals || { replies: 0, ceremony: 0, reception: 0 };
      draw();
      if (!quiet) say(adminStatus, '', '', '');
    } catch (err) {
      if (err.message !== 'unauthorised') {
        say(adminStatus, 'error', 'Nothing could be loaded.', ' Please refresh the page.');
      }
    }
  }

  async function act(entry, action, successNote, path) {
    say(adminStatus, 'busy', 'Saving…', '');
    try {
      await api((path || '/api/admin/entries/') + entry.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action })
      });
      await load(true);
      say(adminStatus, 'ok', successNote, '');
    } catch (err) {
      if (err.message !== 'unauthorised') {
        say(adminStatus, 'error', 'That change could not be saved.', ' Please try again.');
      }
    }
  }

  /* ---------- events ---------- */

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      filter = tab.dataset.filter;
      say(adminStatus, '', '', '');
      draw();
    });
    // Left/right arrow keys move between tabs, as expected of a tab list.
    tab.addEventListener('keydown', function (event) {
      var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      var next = tabs[(index + step + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    loginBtn.disabled = true;
    say(loginStatus, 'busy', 'Signing in…', '');
    try {
      var response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.value })
      });
      if (!response.ok) {
        // Show what the server actually said. A password that was never set in
        // Cloudflare is a different problem from a password typed wrongly, and
        // calling both "wrong password" sends people hunting in the wrong place.
        var reason = await response.json().catch(function () { return {}; });
        throw new Error(reason.error || 'That password was not right.');
      }
      say(loginStatus, '', '', '');
      showAdmin();
    } catch (err) {
      say(loginStatus, 'error', err.message || 'That password was not right.', '');
      password.value = '';
      password.focus();
    } finally {
      loginBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async function () {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* ignore */ }
    showLogin('You have been signed out.');
  });

  /* ---------- start: are we already signed in? ---------- */

  fetch('/api/admin/entries', { credentials: 'same-origin' })
    .then(function (response) {
      if (response.ok) showAdmin();
      else showLogin();
    })
    .catch(function () { showLogin(); });
})();
