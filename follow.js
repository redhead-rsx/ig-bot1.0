(async () => {
  const DEBUG = true;
  const log = (...a) => { try { if (DEBUG) console.log('[FOLLOW]', ...a); } catch(_) {} };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, { timeout = 8000, interval = 150 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch {}
      await sleep(interval);
    }
    return null;
  };
  const send = (payload) => { try { chrome.runtime.sendMessage({ type: 'FOLLOW_RESULT', ...payload }); } catch(_) {} };
  const wantLike = !!(window.__FOLLOW_OPTIONS && window.__FOLLOW_OPTIONS.wantLike);

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

  const normalize = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const robustClick = async (el) => {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch {}
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const mouse = (type) => el.dispatchEvent(new MouseEvent(type, { bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy, buttons:1 }));
    try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, clientX:cx, clientY:cy, pointerId:1, pointerType:'mouse', isPrimary:true })); } catch {}
    mouse('mousedown'); mouse('mouseup'); mouse('click');
    el.click?.();
    el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key:' ', bubbles:true }));
    await sleep(350);
    return true;
  };

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

  const findLikeBtn = () => {
    let el = document.querySelector('[aria-label*="Curtir" i], [aria-label*="Like" i], [aria-label*="Descurtir" i], [aria-label*="Unlike" i]');
    if (el) return el.closest('button, [role="button"]') || (el.tagName === 'BUTTON' ? el : null);
    const arts = Array.from(document.querySelectorAll('article'));
    for (const art of arts) {
      const svg = art.querySelector('button svg[aria-label], [role="button"] svg[aria-label]');
      if (svg) return svg.closest('button, [role="button"]') || svg;
    }
    const shareSvg = document.querySelector('svg[aria-label*="Compartilhar" i], svg[aria-label*="Share" i]');
    const bar = shareSvg?.closest('section, div[role="group"], div[style*="display: flex"]') || shareSvg?.parentElement?.closest('section, div');
    if (bar) {
      const btns = Array.from(bar.querySelectorAll('button, [role="button"]'));
      const filtered = btns.filter(b => !/salvar|save/i.test((b.getAttribute('aria-label') || b.querySelector('[aria-label]')?.getAttribute('aria-label') || '')));
      if (filtered.length >= 1) return filtered[0];
    }
    const svg = document.querySelector('svg[aria-label], [role="img"][aria-label]');
    return svg ? (svg.closest('button, [role="button"]') || svg) : null;
  };

  const confirmLiked = async (btn) => {
    if (isLiked(btn)) return true;
    const ok = await waitFor(() =>
      document.querySelector('article svg[aria-label*="Descurtir" i], article svg[aria-label*="Unlike" i]') ||
      document.querySelector('article svg path[fill]:not([fill="none"])') ? true : null,
      { timeout: 1200, interval: 120 }
    );
    return !!ok || isLiked(btn);
  };

  const likeFirstPost = async () => {
    try {
      const txt = (document.body.innerText || '').toLowerCase();
      if (txt.includes('esta conta e privada') || txt.includes('conta privada') || txt.includes('this account is private')) {
        return { like: 'SKIP', likeReason: 'private' };
      }
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
      if (!anchor) return { like: 'SKIP', likeReason: 'no_post' };
      if (!(/\/p\/|\/reel\//.test(location.pathname))) {
        const url = new URL(anchor.getAttribute('href'), location.origin).href;
        location.assign(url);
        await waitFor(() => (/\/p\/|\/reel\//.test(location.pathname)), { timeout: 10000, interval: 150 });
        await waitFor(() => document.readyState === 'complete', { timeout: 6000, interval: 100 });
        await sleep(400);
        closeOverlays();
      }
      let btn = await waitFor(findLikeBtn, { timeout: 7000, interval: 150 });
      if (isLiked(btn)) return { like: 'DONE' };
      if (btn) {
        await robustClick(btn);
        if (await confirmLiked(btn)) return { like: 'DONE' };
        const svg = btn.querySelector('svg');
        if (svg) {
          await robustClick(svg);
          if (await confirmLiked(btn)) return { like: 'DONE' };
        }
      }
      const art = document.querySelector('article');
      if (art) { art.focus?.(); art.click?.(); }
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'l', bubbles:true }));
      await sleep(600);
      btn = findLikeBtn();
      if (await confirmLiked(btn)) return { like: 'DONE' };
      const media = document.querySelector('article img, article video');
      if (media) {
        const r = media.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        const ev = (type) => new MouseEvent(type, { bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy });
        media.dispatchEvent(ev('click')); await sleep(80);
        media.dispatchEvent(ev('click')); await sleep(700);
        btn = findLikeBtn();
        if (await confirmLiked(btn)) return { like: 'DONE' };
      }
      return { like: 'SKIP', likeReason: 'state_not_changed' };
    } catch (e) {
      return { like: 'SKIP', likeReason: 'error' };
    }
  };

  try {
    await waitFor(() => document.readyState === 'complete', { timeout: 8000, interval: 100 });
    closeOverlays();
    if (document.visibilityState !== 'visible') return send({ result: 'need_focus' });
    const header = document.querySelector('main > header') || document.querySelector('header');
    if (!header) {
      log('matched=no_header');
      return send({ result: 'NO_FOLLOW_BUTTON' });
    }

    const btns = Array.from(header.querySelectorAll('button, [role="button"], a[role="button"]'));
    const comboText = (el) => normalize((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || ''));
    const texts = Array.from(header.querySelectorAll('*'))
      .map(el => normalize(el.innerText))
      .filter(t => t && t.length <= 32);

    const isFollowBack = (t) => /\bseguir\b\s+\bde\b\s+\bvolta\b/.test(t) || /\bfollow\b\s+\bback\b/.test(t);
    const isFollowing = (t) => /\bseguindo\b|\bfollowing\b/.test(t);
    const isRequested = (t) => /\bsolicitado\b|\brequested\b/.test(t);
    const isFollowOnly = (t) => ((/\bseguir\b/.test(t) || /\bfollow\b/.test(t)) && !isFollowBack(t) && !isFollowing(t) && !isRequested(t));

    const followBackBtn = btns.find(b => isFollowBack(comboText(b)));
    if (followBackBtn) {
      log('matched=follow_back_button', followBackBtn, comboText(followBackBtn).slice(0,40));
      return send({ result: 'ALREADY_FOLLOWS' });
    }

    const followsYouTokens = ['segue voce', 'follows you', 'te segue', 'segue te'];
    const followsYou = texts.find(t => followsYouTokens.some(tok => new RegExp(`\\b${tok}\\b`).test(t)));
    if (followsYou) {
      log('matched=follows_you_text', followsYou.slice(0,40));
      return send({ result: 'ALREADY_FOLLOWS' });
    }

    const alreadyBtn = btns.find(b => isFollowing(comboText(b)));
    if (alreadyBtn) {
      log('matched=already_following', alreadyBtn, comboText(alreadyBtn).slice(0,40));
      return send({ result: 'ALREADY_FOLLOWING' });
    }

    const requestedBtn = btns.find(b => isRequested(comboText(b)));
    if (requestedBtn) {
      log('matched=requested', requestedBtn, comboText(requestedBtn).slice(0,40));
      return send({ result: 'FOLLOW_REQUESTED' });
    }

    const followBtn = btns.find(b => isFollowOnly(comboText(b)));
    if (!followBtn) {
      log('matched=no_follow_button');
      return send({ result: 'NO_FOLLOW_BUTTON' });
    }

    log('matched=follow_only', followBtn, comboText(followBtn).slice(0,40));

    await robustClick(followBtn);
    const state = await waitFor(() => {
      const t = comboText(followBtn);
      if (isFollowing(t)) return 'FOLLOW_DONE';
      if (isRequested(t)) return 'FOLLOW_REQUESTED';
      return null;
    }, { timeout: 5000, interval: 200 });
    if (!state) return send({ result: 'SKIP_NO_ACTION' });

    if (state === 'FOLLOW_DONE') {
      if (wantLike) {
        const likeRes = await likeFirstPost();
        return send({ result: 'FOLLOW_DONE', ...likeRes });
      }
      return send({ result: 'FOLLOW_DONE' });
    }
    if (state === 'FOLLOW_REQUESTED') {
      return send({ result: 'FOLLOW_REQUESTED' });
    }

    send({ result: 'SKIP_NO_ACTION' });
  } catch (e) {
    send({ result: 'ERROR' });
  }
})();
