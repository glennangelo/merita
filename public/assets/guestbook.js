/* Public guestbook: shows the messages the family has approved for the website. */
(function () {
  var list      = document.getElementById('entries');
  var statusBox = document.getElementById('load-status');

  function say(tone, headline, detail) {
    statusBox.dataset.tone = tone;
    statusBox.innerHTML = '';
    if (headline) {
      var strong = document.createElement('strong');
      strong.textContent = headline;
      statusBox.appendChild(strong);
    }
    if (detail) statusBox.appendChild(document.createTextNode(detail));
  }

  /* Dates are formatted in the reader's own locale, spelled out in full so
     there is no ambiguity between day and month. */
  function formatDate(iso) {
    var date = new Date(iso.replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? '' : 'Z'));
    if (isNaN(date)) return '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render(entry, index) {
    var item = document.createElement('li');
    item.className = 'entry';

    if (entry.has_photo) {
      var img = document.createElement('img');
      img.className = 'entry__photo';
      img.src = '/api/photo/' + entry.id;
      img.alt = entry.photo_alt || ('A photograph shared by ' + entry.name + '.');
      // The first picture is what a visitor sees straight away, so it is
      // fetched at once; the rest wait until they are scrolled towards.
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      item.appendChild(img);
    }

    var body = document.createElement('p');
    body.className = 'entry__message';
    body.textContent = entry.message;           // textContent, never innerHTML
    item.appendChild(body);

    var by = document.createElement('p');
    by.className = 'entry__by';
    var who = document.createElement('strong');
    who.textContent = entry.name;
    by.appendChild(who);
    var when = formatDate(entry.created_at);
    if (when) by.appendChild(document.createTextNode(when));
    item.appendChild(by);

    return item;
  }

  function empty() {
    var box = document.createElement('li');
    box.className = 'empty';
    box.innerHTML = '<p><strong>There are no messages here yet.</strong></p>' +
      '<p>Yours would be very welcome.</p>' +
      '<p class="actions actions--center"><a class="btn" href="/sign">Leave a message</a></p>';
    return box;
  }

  fetch('/api/entries', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    })
    .then(function (data) {
      var entries = data.entries || [];
      list.replaceChildren.apply(list, entries.length ? entries.map(render) : [empty()]);

      // The empty state speaks for itself, so only show a count when there is one.
      statusBox.dataset.tone = '';
      statusBox.textContent = !entries.length ? ''
        : entries.length === 1 ? '1 message.'
        : entries.length + ' messages.';
    })
    .catch(function () {
      say('error', 'The messages could not be loaded.',
        ' Please check your internet connection and refresh the page.');
    });
})();
