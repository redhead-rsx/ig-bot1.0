// Script responsável por curtir a primeira publicação de um perfil
// É injetado pelo background em uma aba de perfil
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 20000, interval = 500) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const res = fn();
      if (res) return res;
      await sleep(interval);
    }
    return null;
  };
  const send = (type, reason) => chrome.runtime.sendMessage(reason ? { type, reason } : { type });

  const privateRegex = /esta conta é privada|this account is private/i;

  try {
    const main = await waitFor(() => document.querySelector('main'));
    if (!main) return send('LIKE_SKIP', 'timeout');

    if (privateRegex.test(document.body.innerText)) {
      return send('LIKE_SKIP', 'private');
    }

    const thumb = await waitFor(() =>
      main.querySelector('a[href*="/p/"], a[href*="/reel/"]')
    );
    if (!thumb) return send('LIKE_SKIP', 'no_post');

    thumb.click();

    const dialog = await waitFor(() => document.querySelector('div[role="dialog"]'));
    if (!dialog) return send('LIKE_SKIP', 'timeout');

    const likeBtn = await waitFor(() => {
      const svg = dialog.querySelector('svg[aria-label="Curtir"], svg[aria-label="Like"]');
      return svg && svg.closest('button');
    }, 5000);

    let liked = false;
    if (likeBtn) {
      if (likeBtn.getAttribute('aria-pressed') === 'true') {
        liked = true;
      } else {
        likeBtn.click();
        await sleep(1000);
        liked = likeBtn.getAttribute('aria-pressed') === 'true';
      }
    }

    if (!liked) {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      await sleep(500);
      if (likeBtn) {
        liked = likeBtn.getAttribute('aria-pressed') === 'true';
      } else {
        const svg = dialog.querySelector('svg[aria-label="Curtir"], svg[aria-label="Like"]');
        const btn = svg && svg.closest('button');
        liked = btn && btn.getAttribute('aria-pressed') === 'true';
      }
    }

    if (liked) {
      send('LIKE_DONE');
    } else {
      send('LIKE_SKIP', likeBtn ? 'selector_miss' : 'selector_miss');
    }
  } catch (e) {
    send('LIKE_SKIP', 'timeout');
  } finally {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }
})();
