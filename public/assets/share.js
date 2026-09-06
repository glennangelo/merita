/* Sharing a memory.
   Photographs are shrunk in the visitor's own browser before upload, so the
   page works on a phone with a poor signal and the server stays tiny. */
(function () {
  var form      = document.getElementById('memory-form');
  var statusBox = document.getElementById('form-status');
  var submitBtn = document.getElementById('submit-btn');
  var fileInput = document.getElementById('photo');
  var preview   = document.getElementById('photo-preview');
  var previewImg = document.getElementById('photo-preview-img');
  var pickLabel = document.getElementById('photo-pick');
  var removeBtn = document.getElementById('photo-remove');
  var message   = document.getElementById('message');
  var counter   = document.getElementById('message-count');
  var onward    = document.getElementById('onward');

  // Whatever someone picks is shrunk before it is sent, so there is no limit on
  // what they may choose. 1200 pixels is twice the widest a memory is ever
  // shown, which is sharp on a retina screen and a third of the weight of the
  // 2000 this used to keep — forty memories were a 40 MB page on a phone.
  var MAX_EDGE   = 1200;                 // longest side, in pixels
  var MAX_BYTES  = 900 * 1024;           // about 0.9 MB once shrunk
  var processed  = null;          // { blob, type, name, width, height }
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

  /* ---------- character counter ---------- */

  function updateCount() { counter.textContent = message.value.length.toLocaleString(); }
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
    // The shape travels with the picture so the memories page can hold room
    // for it before it arrives, instead of jumping when it does.
    return { blob: blob, width: canvas.width, height: canvas.height };
  }

  function clearPhoto() {
    processed = null;
    fileInput.value = '';
    preview.dataset.shown = 'false';
    pickLabel.textContent = 'Upload';
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    previewImg.removeAttribute('src');
  }

  fileInput.addEventListener('change', async function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) { clearPhoto(); return; }

    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
      clearPhoto();
      say('error', 'That file is not an image.', ' Please choose a JPEG, PNG or WebP.');
      return;
    }

    say('busy', 'Preparing your image…', '');
    submitBtn.disabled = true;

    try {
      var shrunk = await shrink(file);
      processed = {
        blob: shrunk.blob, type: 'image/jpeg', name: 'photo.jpg',
        width: shrunk.width, height: shrunk.height
      };

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(shrunk.blob);
      previewImg.src = previewUrl;
      previewImg.alt = 'The image you have chosen.';
      preview.dataset.shown = 'true';
      pickLabel.textContent = 'Change image';
      clearStatus();
    } catch (err) {
      clearPhoto();
      say('error', 'We could not use that image.',
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

    var visibility = document.getElementById('private').checked ? 'private' : 'public';

    var data = new FormData();
    data.append('name', name.value.trim());
    data.append('message', message.value.trim());
    data.append('visibility', visibility);
    data.append('subject', document.getElementById('subject').value); // spam trap
    if (processed) {
      data.append('photo', processed.blob, processed.name);
      data.append('photo_w', String(processed.width));
      data.append('photo_h', String(processed.height));
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
        // Not "shortly": approving may wait until someone has a quiet moment,
        // and a promise the family cannot keep is worse than a vaguer one.
        say('ok', 'Thank you.',
          ' The family will read it, and it will appear with the memories once they have.');
      }
      onward.hidden = false;
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
