// liker.js — “rock solid”: navega ao post, tenta botão, tecla 'l' e double-tap
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, { timeout = 15000, interval = 150 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch {}
      await sleep(interval);
    }
    return null;
  };
  const send = (type, reason) => {
    try { chrome.runtime.sendMessage(reason ? { type, reason } : { type }); } catch(_) {}
  };

  try {
    await waitFor(() => document.readyState === 'complete', { timeout: 8000, interval: 100 });

    if (document.visibilityState !== 'visible') {
      return send('LIKE_SKIP', 'not_visible');
    }

    const bodyText = (document.body.innerText || '').toLowerCase();
    if (bodyText.includes('esta conta é privada') || bodyText.includes('conta privada') || bodyText.includes('this account is private')) {
      return send('LIKE_SKIP', 'private');
    }

    // ---- localizar primeiro post no perfil ----
    const main = await waitFor(() => document.querySelector('main'), { timeout: 6000 });
    const findFirstPostLink = () => {
      const q = (sel) => (main ? main.querySelector(sel) : document.querySelector(sel));
      return (
        q('article a[href*="/p/"]') ||
        q('article a[href*="/reel/"]') ||
        q('a[href*="/p/"]') ||
        q('a[href*="/reel/"]')
      );
    };
    let anchor = findFirstPostLink();
    if (!anchor) {
      const img = main && main.querySelector('article img');
      if (img) {
        let node = img;
        while (node && node !== document.body) {
          if (node.tagName === 'A' || node.getAttribute('role') === 'button') { anchor = node; break; }
          node = node.parentElement;
        }
      }
    }
    if (!anchor) return send('LIKE_SKIP', 'no_post');

    // Se ainda estamos no perfil, navegue para a URL do post
    if (!(/\/p\/|\/reel\//.test(location.pathname))) {
      const url = new URL(anchor.getAttribute('href'), location.origin).href;
      location.assign(url);
      await waitFor(() => (/\/p\/|\/reel\//.test(location.pathname)), { timeout: 10000, interval: 150 });
      await waitFor(() => document.readyState === 'complete', { timeout: 6000, interval: 100 });
      await sleep(400);
    }

    // ---- utilitários de like ----
    const findLikeControl = () => {
      // tenta primeiro dentro de articles
      const articles = Array.from(document.querySelectorAll('article'));
      for (const art of articles) {
        const svg = art.querySelector('button svg[aria-label], [role="button"] svg[aria-label]');
        if (svg) return svg.closest('button, [role="button"]');
      }
      // fallback global
      const svg = document.querySelector('svg[aria-label*="Curtir" i], svg[aria-label*="Like" i], svg[aria-label*="Descurtir" i], svg[aria-label*="Unlike" i]');
      return svg ? svg.closest('button, [role="button"]') : null;
    };

    const readLabel = (el) => (el?.querySelector('svg')?.getAttribute('aria-label') || '').toLowerCase();
    const isLiked = (el) => {
      if (!el) return false;
      const pressed = el.getAttribute('aria-pressed');
      if (pressed === 'true') return true;
      const label = readLabel(el);
      // Se o label atual é Descurtir/Unlike, já está curtido
      return label.includes('descurtir') || label.includes('unlike');
    };

    const robustClick = async (el) => {
      if (!el) return false;
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch(_) {}
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const ev = (type) => new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, buttons: 1 });
      try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true })); } catch {}
      el.dispatchEvent(ev('mousedown'));
      el.dispatchEvent(ev('mouseup'));
      el.dispatchEvent(ev('click'));
      el.click?.();
      await sleep(450);
      return true;
    };

    let likeBtn = await waitFor(findLikeControl, { timeout: 6000, interval: 150 });
    if (isLiked(likeBtn)) return send('LIKE_DONE');

    // tentativa 1: clicar no botão
    if (likeBtn) {
      await robustClick(likeBtn);
      if (isLiked(likeBtn)) return send('LIKE_DONE');

      // tenta clicar no svg dentro
      const svg = likeBtn.querySelector('svg');
      if (svg) {
        await robustClick(svg);
        if (isLiked(likeBtn)) return send('LIKE_DONE');
      }
    }

    // tentativa 2: teclado 'l'
    const article = document.querySelector('article');
    if (article) { article.focus?.(); article.click?.(); }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    await sleep(600);
    likeBtn = findLikeControl();
    if (isLiked(likeBtn)) return send('LIKE_DONE');

    // tentativa 3: double-tap na mídia
    const media = document.querySelector('article img, article video');
    if (media) {
      const r = media.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const ev = (type) => new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy });
      media.dispatchEvent(ev('click')); await sleep(80);
      media.dispatchEvent(ev('click')); await sleep(600);
      likeBtn = findLikeControl();
      if (isLiked(likeBtn)) return send('LIKE_DONE');
    }

    // não deu pra confirmar curtida
    send('LIKE_SKIP', 'state_not_changed');
  } catch (e) {
    send('LIKE_SKIP', 'error');
  }
})();
