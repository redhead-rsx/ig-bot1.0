(async () => {
  const DEBUG = true;
  const log = (...a) => { try { if (DEBUG) console.log('[FOLLOW]', ...a); } catch(_) {} };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, { timeout = 12000, interval = 150 } = {}) => {
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
    .replace(/[\u00A0\u2010-\u2015\u2212\uFE58\uFE63\uFF0D_-]+/g, ' ')
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
      const main = await waitFor(() => document.querySelector('main'), { timeout: 12000 });
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
        await waitFor(() => (/\/p\/|\/reel\//.test(location.pathname)), { timeout: 12000, interval: 150 });
        await waitFor(() => document.readyState === 'complete', { timeout: 12000, interval: 100 });
        await sleep(400);
        closeOverlays();
      }
      let btn = await waitFor(findLikeBtn, { timeout: 12000, interval: 150 });
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
    await waitFor(() => document.readyState === 'complete', { timeout: 12000, interval: 100 });
    closeOverlays();
    if (document.visibilityState !== 'visible') return send({ result: 'need_focus' });
    const findHeader = () => {
      const direct = document.querySelector('main > header');
      if (direct) return direct;
      const title = document.querySelector('main h1, main h2');
      return title ? title.closest('header, section, div') : document.querySelector('header');
    };
    const header = await waitFor(findHeader, { timeout: 12000, interval: 150 });

    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    if (!header) {
      const finalDecision = 'NO_FOLLOW_BUTTON';
      const primaryTextNorm = '';
      const primaryState = 'none';
      const secondaryBadge = false;
      const via = 'no_header';
      log(`primaryTextNorm="${primaryTextNorm}",`, `primaryState=${primaryState},`, `secondaryBadge=${secondaryBadge},`, `finalDecision=${finalDecision},`, `via=${via}`);
      try { chrome.runtime.sendMessage({ type: 'FOLLOW_DEBUG', primaryTextNorm, primaryState, secondaryBadge, finalDecision, via }); } catch {}
      return send({ result: finalDecision, decision: finalDecision, via });
    }

    const candidates = Array.from(
      header.querySelectorAll('button, [role="button"], a[role="button"]')
    ).filter(isVisible);

    const candsData = candidates.map(btn => {
      const rect = btn.getBoundingClientRect();
      return {
        btn,
        rect,
        text: normalize((btn.innerText || '') + ' ' + (btn.getAttribute('aria-label') || ''))
      };
    });

    const keyword = /(seguir|follow|seguindo|following|solicitado|requested)/;
    const withKeyword = candsData.filter(c => keyword.test(c.text));

    const sortByPos = arr => arr.sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));
    sortByPos(withKeyword);
    sortByPos(candsData);

    const primaryData = withKeyword[0] || candsData[0];
    const primaryBtn = primaryData?.btn || null;
    const getPrimaryText = () => normalize((primaryBtn?.innerText || '') + ' ' + (primaryBtn?.getAttribute('aria-label') || ''));
    const primaryTextNorm = getPrimaryText();

    if (!primaryBtn) {
      const finalDecision = 'NO_FOLLOW_BUTTON';
      const primaryState = 'none';
      const secondaryBadge = false;
      const via = 'no_primary_button';
      log(`primaryTextNorm="${primaryTextNorm}",`, `primaryState=${primaryState},`, `secondaryBadge=${secondaryBadge},`, `finalDecision=${finalDecision},`, `via=${via}`);
      try {
        chrome.runtime.sendMessage({ type: 'FOLLOW_DEBUG', primaryTextNorm, primaryState, secondaryBadge, finalDecision, via });
      } catch {}
      return send({ result: finalDecision, decision: finalDecision, via });
    }

    let primaryState = 'none';
    if (primaryTextNorm === 'seguir de volta' || primaryTextNorm === 'follow back') primaryState = 'follow_back';
    else if (primaryTextNorm === 'seguir' || primaryTextNorm === 'follow') primaryState = 'follow';
    else if (primaryTextNorm === 'seguindo' || primaryTextNorm === 'following') primaryState = 'following';
    else if (primaryTextNorm === 'solicitado' || primaryTextNorm === 'requested') primaryState = 'requested';

    let secondaryBadge = false;
    if (primaryState === 'follow') {
      const texts = Array.from(header.querySelectorAll('*'))
        .filter(el => el !== primaryBtn && !primaryBtn.contains(el))
        .map(el => normalize(el.innerText))
        .filter(t => t && t.length <= 32);
      const followsYouTokens = ['segue voce', 'follows you'];
      secondaryBadge = texts.some(t => followsYouTokens.includes(t));
    }

    let finalDecision = '', via = '';
    const sendDebug = () => {
      log(`primaryTextNorm="${primaryTextNorm}",`, `primaryState=${primaryState},`, `secondaryBadge=${secondaryBadge},`, `finalDecision=${finalDecision},`, `via=${via}`);
      try {
        chrome.runtime.sendMessage({ type: 'FOLLOW_DEBUG', primaryTextNorm, primaryState, secondaryBadge, finalDecision, via });
      } catch {}
    };

    if (primaryState === 'follow_back') {
      finalDecision = 'ALREADY_FOLLOWS';
      via = 'primary_follow_back';
      sendDebug();
      return send({ result: finalDecision, decision: finalDecision, via });
    }
    if (primaryState === 'following') {
      finalDecision = 'ALREADY_FOLLOWING';
      via = 'primary_following';
      sendDebug();
      return send({ result: finalDecision, decision: finalDecision, via });
    }
    if (primaryState === 'requested') {
      finalDecision = 'FOLLOW_REQUESTED';
      via = 'primary_requested';
      sendDebug();
      return send({ result: finalDecision, decision: finalDecision, via });
    }
    if (primaryState === 'follow' && secondaryBadge) {
      finalDecision = 'ALREADY_FOLLOWS';
      via = 'secondary_follows_you';
      sendDebug();
      return send({ result: finalDecision, decision: finalDecision, via });
    }
    if (primaryState !== 'follow') {
      finalDecision = 'NO_FOLLOW_BUTTON';
      via = 'no_primary_match';
      sendDebug();
      return send({ result: finalDecision, decision: finalDecision, via });
    }

    // primaryState === 'follow' without secondary badge
    via = 'primary_follow';
    await robustClick(primaryBtn);
    const state = await waitFor(() => {
      const t = getPrimaryText();
      if (t === 'seguindo' || t === 'following') return 'FOLLOW_DONE';
      if (t === 'solicitado' || t === 'requested') return 'FOLLOW_REQUESTED';
      return null;
    }, { timeout: 12000, interval: 200 });

    if (!state) {
      finalDecision = 'SKIP_NO_ACTION';
      via = 'state_not_changed';
      sendDebug();
      return send({ result: finalDecision, decision: finalDecision, via });
    }

    finalDecision = state;
    sendDebug();

    if (state === 'FOLLOW_DONE') {
      if (wantLike) {
        const likeRes = await likeFirstPost();
        return send({ result: finalDecision, decision: finalDecision, via, ...likeRes });
      }
      return send({ result: finalDecision, decision: finalDecision, via });
    }
    if (state === 'FOLLOW_REQUESTED') {
      return send({ result: finalDecision, decision: finalDecision, via });
    }

    finalDecision = 'SKIP_NO_ACTION';
    via = 'state_not_changed';
    sendDebug();
    return send({ result: finalDecision, decision: finalDecision, via });
  } catch (e) {
    send({ result: 'ERROR' });
  }
})();
