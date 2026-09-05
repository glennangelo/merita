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

  var MIN = 1, MAX = 20;

  /* The plus and minus buttons. The number can still be typed, so this reads
     the field rather than keeping a count of its own. */
  function partySize() {
    var n = parseInt(party.value, 10);
    return isNaN(n) ? MIN : n;
  }

  /* The buttons keep themselves within range; typing is left alone. Correcting
     the field on every keystroke would mean it could not be cleared to retype,
     and would quietly turn a typed 0 into 1 — sending a reply nobody made. An
     impossible number is caught on sending instead, where it can be explained. */
  function syncButtons() {
    var n = partySize();
    less.disabled = !(n > MIN);
    more.disabled = !(n < MAX);
  }

  function setParty(n) {
    n = Math.min(MAX, Math.max(MIN, n));
    party.value = String(n);
    syncButtons();
    // Said aloud: the number changing is not otherwise announced to someone
    // who cannot see it.
    said.textContent = n === 1 ? '1 person' : n + ' people';
  }

  less.addEventListener('click', function () { setParty(partySize() - 1); });
  more.addEventListener('click', function () { setParty(partySize() + 1); });
  party.addEventListener('input', syncButtons);
  syncButtons();

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
    name.setAttribute('aria-invalid', 'false');
    party.setAttribute('aria-invalid', 'false');

    if (!name.value.trim()) {
      name.setAttribute('aria-invalid', 'true');
      say('error', 'Please add your name.', '');
      name.focus();
      return;
    }

    var howMany = parseInt(party.value, 10);
    if (!(howMany >= 1 && howMany <= 20)) {
      party.setAttribute('aria-invalid', 'true');
      say('error', 'How many of you are coming?', ' A number between 1 and 20.');
      party.focus();
      return;
    }

    if (!ceremony.checked && !reception.checked) {
      say('error', 'Which part of the day?', ' Please tick the ceremony, the reception, or both.');
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
          website: document.getElementById('website').value
        })
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || 'Request failed');

      form.hidden = true;
      say('ok', 'Thank you — we have you down.',
        howMany === 1 ? ' We look forward to seeing you.'
                      : ' We look forward to seeing all ' + howMany + ' of you.');
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
