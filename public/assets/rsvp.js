/* Replying to the invitation. */
(function () {
  var form      = document.getElementById('rsvp-form');
  var statusBox = document.getElementById('form-status');
  var submitBtn = document.getElementById('submit-btn');
  var name      = document.getElementById('name');
  var party     = document.getElementById('party');
  var ceremony  = document.getElementById('ceremony');
  var reception = document.getElementById('reception');

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
