// liker.js
// Injected into Instagram profile to like first post/reel
(function () {
  const CLOSE_TOKENS = [
    'agora não',
    'agora nao',
    'not now',
    'salvar informações',
    'save info',
    'ativar notificações',
    'turn on notifications'
  ];
  const PRIVATE_TOKENS = ['esta conta é privada', 'this account is private'];

  function log(...args) {
    console.log('[LIKER]', ...args);
  }

  function normalize(t) {
    return t ? t.toLowerCase().replace(/\s+/g, ' ').trim() : '';
  }

  function closeOverlays() {
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.forEach((btn) => {
      const txt = normalize(btn.innerText);
      if (CLOSE_TOKENS.some((ct) => txt.includes(ct))) btn.click();
    });
  }

  function send(status, reason) {
    chrome.runtime.sendMessage({ type: 'LIKE_RESULT', status, reason });
  }

  function waitFor(cond, timeout = 5000) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        if (cond()) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(check, 200);
      })();
    });
  }

  async function like() {
    if (document.visibilityState !== 'visible') {
      send('LIKE_SKIP', 'not_visible');
      return;
    }

    closeOverlays();

    const bodyText = normalize(document.body.innerText || '');
    if (PRIVATE_TOKENS.some((t) => bodyText.includes(t))) {
      send('LIKE_SKIP', 'private');
      return;
    }

    let first = document.querySelector('main article a[href*="/p/"], main article a[href*="/reel/"]');
    if (!first) {
      const img = document.querySelector('main article img');
      first = img ? img.closest('a[href]') : null;
    }
    if (!first) {
      send('LIKE_SKIP', 'no_post');
      return;
    }

    first.click();
    const overlayLoaded = await waitFor(() =>
      document.querySelector('article div[role="button"]') ||
      document.querySelector('svg[aria-label*="Curtir"], svg[aria-label*="Like"]')
    , 5000);
    if (!overlayLoaded) {
      send('LIKE_SKIP', 'not_visible');
      return;
    }

    closeOverlays();
    await new Promise((r) => setTimeout(r, 200));

    let likeBtn = Array.from(document.querySelectorAll('button[aria-label], svg[aria-label]'))
      .map((el) => el.closest('button'))
      .find((btn) => {
        const lbl = normalize(btn.getAttribute('aria-label'));
        return /curtir|like/.test(lbl);
      });

    const media = document.querySelector('article img, article video');

    async function attemptFallbacks() {
      if (likeBtn) {
        likeBtn.click();
        return;
      }
      if (media) {
        media.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', bubbles: true }));
    }

    await attemptFallbacks();
    await new Promise((r) => setTimeout(r, 500));

    likeBtn = Array.from(document.querySelectorAll('button[aria-label], svg[aria-label]'))
      .map((el) => el.closest('button'))
      .find((btn) => {
        const pressed = btn.getAttribute('aria-pressed');
        const lbl = normalize(btn.getAttribute('aria-label'));
        const svg = btn.querySelector('svg path');
        return (
          pressed === 'true' ||
          /descurtir|unlike/.test(lbl) ||
          (svg && svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none')
        );
      });

    if (likeBtn) {
      send('LIKE_DONE');
    } else {
      send('LIKE_SKIP', 'state_not_changed');
    }
  }

  if (document.readyState === 'complete') {
    like().catch((e) => {
      log('error', e);
      send('LIKE_SKIP', 'error');
    });
  } else {
    window.addEventListener('load', () =>
      like().catch((e) => {
        log('error', e);
        send('LIKE_SKIP', 'error');
      })
    );
  }
})();
