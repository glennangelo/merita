/* Replying to the invitation. */
(function () {
  var form      = document.getElementById('rsvp-form');
  var statusBox = document.getElementById('form-status');
  var submitBtn = document.getElementById('submit-btn');
  var name      = document.getElementById('name');
  var party     = document.getElementById('party');
  var ceremony  = document.getElementById('ceremony');
  var reception = document.getElementById('reception');
  var less      = document.getElementById('party-less');
  var more      = document.getElementById('party-more');
  var said      = document.getElementById('party-said');
  var nameLabel = document.getElementById('name-label');
  var onward    = document.getElementById('onward');

  var MIN = 1, MAX = 20;

  /* The plus and minus buttons. The number can still be typed, so this reads
     the field rather than keeping a count of its own. */
  function partySize() {
    var n = parseInt(party.value, 10);
    return isNaN(n) ? MIN : n;
  }

  /* One person is asked for a name, a party for all of theirs — and answers
     for themselves or for all of them. */
  function asksFor(n) {
    return n > 1 ? 'Your names' : 'Your name';
  }

  /* The buttons keep themselves within range, and the name field asks for as
     many names as there are people coming; typing is left alone. Correcting
     the field on every keystroke would mean it could not be cleared to retype,
     and would quietly turn a typed 0 into 1 — sending a reply nobody made. An
     impossible number is caught on sending instead, where it can be explained. */
  function syncToParty() {
    var n = partySize();
    less.disabled = !(n > MIN);
    more.disabled = !(n < MAX);
    nameLabel.textContent = asksFor(n);
  }

  function setParty(n) {
    n = Math.min(MAX, Math.max(MIN, n));
    party.value = String(n);
    syncToParty();
    // Said aloud: the number changing is not otherwise announced to someone
    // who cannot see it.
    said.textContent = n === 1 ? '1 person' : n + ' people';
  }

  less.addEventListener('click', function () { setParty(partySize() - 1); });
  more.addEventListener('click', function () { setParty(partySize() + 1); });
  party.addEventListener('input', syncToParty);
  syncToParty();

  /* An error belongs beside the answer it is about: it is written into the
     line above the field, which is empty and out of the way until then. The
     box at the top of the form is left for what concerns the whole of it —
     sending, and the sending failing. */
  function fault(input, boxId, text) {
    var box = document.getElementById(boxId);
    box.textContent = text;
    box.hidden = false;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', boxId);
      input.focus();
    }
  }
  function clearFaults() {
    ['party-error', 'name-error', 'attend-error'].forEach(function (id) {
      var box = document.getElementById(id);
      box.hidden = true;
      box.textContent = '';
    });
    [name, party].forEach(function (input) {
      input.setAttribute('aria-invalid', 'false');
      input.removeAttribute('aria-describedby');
    });
  }
  /* Corrected as they are typed, rather than standing until the next attempt. */
  [name, party].forEach(function (input) {
    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true') clearFaults();
    });
  });
  [ceremony, reception].forEach(function (box) {
    box.addEventListener('change', function () {
      if (ceremony.checked || reception.checked) clearFaults();
    });
  });

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

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearFaults();

    if (!name.value.trim()) {
      fault(name, 'name-error',
        partySize() > 1 ? 'Please add your names.' : 'Please add your name.');
      return;
    }

    var howMany = parseInt(party.value, 10);
    if (!(howMany >= 1 && howMany <= 20)) {
      fault(party, 'party-error', 'How many of you are coming? A number between 1 and 20.');
      return;
    }

    if (!ceremony.checked && !reception.checked) {
      fault(null, 'attend-error',
        'Which part of the day? Please tick the ceremony, the celebration of life, or both.');
      ceremony.focus();
      return;
    }

    submitBtn.disabled = true;
    say('busy', 'Sending…', '');

    try {
      var response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.value.trim(),
          party_size: howMany,
          ceremony: ceremony.checked,
          reception: reception.checked,
          contact: document.getElementById('contact').value.trim(),
          subject: document.getElementById('subject').value
        })
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || 'Request failed');

      form.hidden = true;
      say('ok', 'Thank you for letting us know.', '');
      onward.hidden = false;
      /* The invitation below runs to the foot of the page, so the space main
         normally leaves beneath it would show as a stripe of bare parchment. */
      document.getElementById('main').classList.add('ends-with-band');
      statusBox.setAttribute('tabindex', '-1');
      statusBox.focus();
      window.scrollTo({ top: 0 });
    } catch (err) {
      submitBtn.disabled = false;
      say('error', 'That could not be sent.',
        ' Please check your connection and try again, or contact the family directly.');
    }
  });
})();
