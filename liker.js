(async () => {
  const DEBUG = true;
  const log = (...a) => { try { if (DEBUG) console.log('[LIKER]', ...a); } catch(_) {} };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, { timeout = 15000, interval = 150 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch {}
      await sleep(interval);
    }
    return null;
  };
  const send = (type, reason) => { try { chrome.runtime.sendMessage(reason ? { type, reason } : { type }); } catch(_) {} };

  // Fecha popups/overlays que podem bloquear clique
  const closeOverlays = () => {
    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
    const wanted = [
      'agora não','agora nao','not now',
      'ativar notificações','turn on notifications',
      'salvar informações','save login info','lembrar','remember',
      'aceitar','accept','permitir','allow','ok'
    ];
    let closed = 0;
    for (const b of btns) {
      const t = (b.innerText || '').trim().toLowerCase();
      if (wanted.some(w => t.includes(w))) { try { b.click(); closed++; } catch {} }
    }
    if (closed) log('closed overlays:', closed);
  };

  // 3 sinais de "curtido"
  const isLiked = (btn) => {
    try {
      if (!btn) return false;
      const pressed = btn.getAttribute('aria-pressed');
      if (pressed === 'true') return true;
      const svg = btn.querySelector('svg');
      const label = (svg?.getAttribute('aria-label') || btn.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('descurtir') || label.includes('unlike')) return true;
      const path = svg?.querySelector('path');
      const fill = path?.getAttribute('fill') || svg?.getAttribute('fill');
      if (fill && fill !== 'none' && fill !== 'transparent') return true;
    } catch {}
    return false;
  };

  // tenta achar o botão via vários caminhos
  const findLikeBtn = () => {
    // 1) Qualquer elemento com aria-label (PT/EN) → sobe pro button
    let el = document.querySelector('[aria-label*="Curtir" i], [aria-label*="Like" i], [aria-label*="Descurtir" i], [aria-label*="Unlike" i]');
    if (el) return el.closest('button, [role="button"]') || (el.tagName === 'BUTTON' ? el : null);

    // 2) Dentro de articles: qualquer svg com aria-label (cobre muitos casos)
    const arts = Array.from(document.querySelectorAll('article'));
    for (const art of arts) {
      const svg = art.querySelector('button svg[aria-label], [role="button"] svg[aria-label]');
      if (svg) return svg.closest('button, [role="button"]') || svg;
    }

    // 3) Inferir barra de ações a partir do “Compartilhar/Share”
    const shareSvg = document.querySelector('svg[aria-label*="Compartilhar" i], svg[aria-label*="Share" i]');
    const bar = shareSvg?.closest('section, div[role="group"], div[style*="display: flex"]') || shareSvg?.parentElement?.closest('section, div');
    if (bar) {
      // normalmente: [Curtir] [Comentar] [Compartilhar] [Salvar]
      const btns = Array.from(bar.querySelectorAll('button, [role="button"]'));
      // remove “Salvar/Save”
      const filtered = btns.filter(b => !/salvar|save/i.test((b.getAttribute('aria-label') || b.querySelector('[aria-label]')?.getAttribute('aria-label') || '')));
      if (filtered.length >= 1) return filtered[0];
    }

    // 4) Fallback global por svg
    const svg = document.querySelector('svg[aria-label], [role="img"][aria-label]');
    return svg ? (svg.closest('button, [role="button"]') || svg) : null;
  };

  const robustClick = async (el) => {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch {}
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const mouse = (type, extra={}) => el.dispatchEvent(new MouseEvent(type, { bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy, buttons:1, ...extra }));
    try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, clientX:cx, clientY:cy, pointerId:1, pointerType:'mouse', isPrimary:true })); } catch {}
    mouse('mousedown'); mouse('mouseup'); mouse('click'); el.click?.();
    // e tenta tecla Enter/Space
    el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key:' ', bubbles:true }));
    await sleep(350);
    return true;
  };

  const confirmLiked = async (btn) => {
    if (isLiked(btn)) return true;
    // espera algum sinal global no article
    const ok = await waitFor(() =>
      document.querySelector('article svg[aria-label*="Descurtir" i], article svg[aria-label*="Unlike" i]') ||
      document.querySelector('article svg path[fill]:not([fill="none"])')
      ? true : null,
      { timeout: 1200, interval: 120 }
    );
    return !!ok || isLiked(btn);
  };

  try {
    await waitFor(() => document.readyState === 'complete', { timeout: 8000, interval: 100 });
    closeOverlays();

    if (document.visibilityState !== 'visible') {
      log('not visible → skip');
      return send('LIKE_SKIP', 'not_visible');
    }

    const txt = (document.body.innerText || '').toLowerCase();
    if (txt.includes('esta conta é privada') || txt.includes('conta privada') || txt.includes('this account is private')) {
      log('private → skip');
      return send('LIKE_SKIP', 'private');
    }

    // 1) achar post e navegar (se estiver no perfil)
    const main = await waitFor(() => document.querySelector('main'), { timeout: 6000 });
    const findFirstPostLink = () => {
      const q = (sel) => (main ? main.querySelector(sel) : document.querySelector(sel));
      return q('article a[href*="/p/"]') || q('article a[href*="/reel/"]') || q('a[href*="/p/"]') || q('a[href*="/reel/"]');
    };
    let anchor = findFirstPostLink();
    if (!anchor) {
      const img = main && main.querySelector('article img');
      if (img) {
        let n = img;
        while (n && n !== document.body) {
          if (n.tagName === 'A' || n.getAttribute('role') === 'button') { anchor = n; break; }
          n = n.parentElement;
        }
      }
    }
    if (!anchor) { log('no post link'); return send('LIKE_SKIP', 'no_post'); }

    if (!(/\/p\/|\/reel\//.test(location.pathname))) {
      const url = new URL(anchor.getAttribute('href'), location.origin).href;
      log('navigating to post:', url);
      location.assign(url);
      await waitFor(() => (/\/p\/|\/reel\//.test(location.pathname)), { timeout: 10000, interval: 150 });
      await waitFor(() => document.readyState === 'complete', { timeout: 6000, interval: 100 });
      await sleep(400);
      closeOverlays();
    }

    // 2) tentar curtir
    let btn = await waitFor(findLikeBtn, { timeout: 7000, interval: 150 });
    log('like btn?', !!btn, 'pressed:', btn?.getAttribute('aria-pressed') || null, 'label:', btn?.getAttribute('aria-label') || btn?.querySelector('svg')?.getAttribute('aria-label') || null);

    if (isLiked(btn)) { log('already liked'); return send('LIKE_DONE'); }

    if (btn) {
      await robustClick(btn);
      if (await confirmLiked(btn)) { log('liked by button'); return send('LIKE_DONE'); }

      const svg = btn.querySelector('svg');
      if (svg) {
        await robustClick(svg);
        if (await confirmLiked(btn)) { log('liked by svg'); return send('LIKE_DONE'); }
      }
    }

    // 3) tecla 'l'
    const art = document.querySelector('article');
    if (art) { art.focus?.(); art.click?.(); }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'l', bubbles:true }));
    await sleep(600);
    btn = findLikeBtn();
    if (await confirmLiked(btn)) { log('liked by key L'); return send('LIKE_DONE'); }

    // 4) double-tap
    const media = document.querySelector('article img, article video');
    if (media) {
      const r = media.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const ev = (type) => new MouseEvent(type, { bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy });
      media.dispatchEvent(ev('click')); await sleep(80);
      media.dispatchEvent(ev('click')); await sleep(700);
      btn = findLikeBtn();
      if (await confirmLiked(btn)) { log('liked by double tap'); return send('LIKE_DONE'); }
    }

    log('state not changed → skip');
    send('LIKE_SKIP', 'state_not_changed');
  } catch (e) {
    log('error', e?.message);
    send('LIKE_SKIP', 'error');
  }
})();
