/* Guestbook submission form.
   Photographs are shrunk in the visitor's own browser before upload, so the
   page works on a phone with a poor signal and the server stays tiny. */
(function () {
  var form      = document.getElementById('guestbook-form');
  var statusBox = document.getElementById('form-status');
  var submitBtn = document.getElementById('submit-btn');
  var fileInput = document.getElementById('photo');
  var preview   = document.getElementById('photo-preview');
  var previewImg  = document.getElementById('photo-preview-img');
  var previewMeta = document.getElementById('photo-preview-meta');
  var removeBtn = document.getElementById('photo-remove');
  var altField  = document.getElementById('photo-alt-field');
  var altInput  = document.getElementById('photo-alt');
  var message   = document.getElementById('message');
  var counter   = document.getElementById('message-count');

  var MAX_EDGE   = 1400;          // longest side, in pixels
  var MAX_BYTES  = 800 * 1024;    // after shrinking
  var processed  = null;          // { blob, type, name }
  var previewUrl = null;

  /* ---------- small helpers ---------- */

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

  function clearStatus() {
    statusBox.dataset.tone = '';
    statusBox.textContent = '';
  }

  function kb(bytes) { return Math.max(1, Math.round(bytes / 1024)) + ' KB'; }

  /* ---------- character counter ---------- */

  function updateCount() { counter.textContent = String(message.value.length); }
  message.addEventListener('input', updateCount);
  updateCount();

  /* ---------- photograph handling ---------- */

  async function decode(file) {
    // createImageBitmap honours the photo's rotation flag, so portrait photos
    // taken on a phone do not arrive sideways.
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) { /* fall through to the older method */ }
    }
    return await new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }

  async function shrink(file) {
    var source = await decode(file);
    var w = source.width, h = source.height;
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));

    var canvas = document.createElement('canvas');
    var quality = 0.82;
    var blob = null;

    // Shrink, then step the quality down if the result is still large.
    for (var attempt = 0; attempt < 5; attempt++) {
      canvas.width  = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';                    // flatten any transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, 'image/jpeg', quality);
      });
      if (!blob) throw new Error('encode failed');
      if (blob.size <= MAX_BYTES) break;

      if (quality > 0.6) quality -= 0.12; else scale *= 0.8;
    }

    if (source.close) source.close();
    if (blob.size > MAX_BYTES) throw new Error('too large');
    return blob;
  }

  function clearPhoto() {
    processed = null;
    fileInput.value = '';
    preview.dataset.shown = 'false';
    altField.hidden = true;
    altInput.value = '';
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    previewImg.removeAttribute('src');
  }

  fileInput.addEventListener('change', async function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) { clearPhoto(); return; }

    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
      clearPhoto();
      say('error', 'That file is not a picture.', ' Please choose a JPEG, PNG or WebP.');
      return;
    }

    say('busy', 'Preparing your photograph…', '');
    submitBtn.disabled = true;

    try {
      var blob = await shrink(file);
      processed = { blob: blob, type: 'image/jpeg', name: 'photo.jpg' };

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      previewImg.src = previewUrl;
      previewImg.alt = 'The photograph you have chosen.';
      previewMeta.textContent = 'Ready to send — ' + kb(blob.size) + '.';
      preview.dataset.shown = 'true';
      altField.hidden = false;
      clearStatus();
    } catch (err) {
      clearPhoto();
      say('error', 'We could not use that photograph.',
        ' Some iPhone photos are in a format this page cannot read. Please try another.');
    } finally {
      submitBtn.disabled = false;
    }
  });

  removeBtn.addEventListener('click', function () {
    clearPhoto();
    clearStatus();
    fileInput.focus();
  });

  /* ---------- submission ---------- */

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var name = document.getElementById('name');
    name.setAttribute('aria-invalid', 'false');
    message.setAttribute('aria-invalid', 'false');

    if (!name.value.trim()) {
      name.setAttribute('aria-invalid', 'true');
      say('error', 'Please add your name.', '');
      name.focus();
      return;
    }
    if (!message.value.trim()) {
      message.setAttribute('aria-invalid', 'true');
      say('error', 'Please write a message.', ' Even a single sentence is welcome.');
      message.focus();
      return;
    }

    var visibility = form.querySelector('input[name="visibility"]:checked').value;

    var data = new FormData();
    data.append('name', name.value.trim());
    data.append('message', message.value.trim());
    data.append('visibility', visibility);
    data.append('website', document.getElementById('website').value); // spam trap
    if (processed) {
      data.append('photo', processed.blob, processed.name);
      data.append('photo_alt', altInput.value.trim());
    }

    submitBtn.disabled = true;
    say('busy', 'Sending your message…', '');

    try {
      var response = await fetch('/api/entries', { method: 'POST', body: data });
      var result = await response.json().catch(function () { return {}; });

      if (!response.ok) throw new Error(result.error || 'Request failed');

      form.hidden = true;
      if (visibility === 'private') {
        say('ok', 'Thank you.', ' Your message has gone to the family. Only they will see it.');
      } else {
        say('ok', 'Thank you.', ' The family will read it, and it will appear in the guestbook shortly.');
      }
      // Move focus to the confirmation so a screen reader reads it out and a
      // keyboard user carries on from the right place.
      statusBox.setAttribute('tabindex', '-1');
      statusBox.focus();
      window.scrollTo({ top: 0 });
    } catch (err) {
      submitBtn.disabled = false;
      say('error', 'Your message could not be sent.',
        ' Please check your connection and try again. If it keeps happening, contact the family directly.');
    }
  });
})();
