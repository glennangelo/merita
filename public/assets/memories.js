/* Memories: the ones the family has approved for the website. */
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

    // Just who it is from. A memory is not dated correspondence, and a
    // timestamp only invites comparison between what came early and what late.
    var by = document.createElement('p');
    by.className = 'entry__by';
    var who = document.createElement('strong');
    who.textContent = entry.name;
    by.appendChild(who);
    item.appendChild(by);

    return item;
  }

  function empty() {
    var box = document.createElement('li');
    box.className = 'empty';
    box.innerHTML = '<p><strong>No memories yet.</strong></p>' +
      '<p class="actions actions--center"><a class="btn" href="/share">Share the first</a></p>';
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

      // Nothing is said once they have loaded — no count. The box stays for the
      // "loading" and "could not be loaded" messages, and collapses when empty.
      statusBox.dataset.tone = '';
      statusBox.textContent = '';
    })
    .catch(function () {
      say('error', 'The memories could not be loaded.', ' Please refresh the page.');
    });
})();
