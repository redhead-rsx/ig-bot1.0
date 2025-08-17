(async () => {
  const DEBUG = true;
  const log = (...a) => { try { if (DEBUG) console.log('[CHECK]', ...a); } catch (_) {} };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, { timeout = 8000, interval = 150 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch {}
      await sleep(interval);
    }
    return null;
  };
  const send = (payload) => {
    try { chrome.runtime.sendMessage({ type: 'CHECK_DONE', ...payload }); } catch (_) {}
  };

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

  try {
    await waitFor(() => document.readyState === 'complete', { timeout: 8000, interval: 100 });
    closeOverlays();

    if (document.visibilityState !== 'visible') {
      log('not visible');
      return send({ reason: 'not_visible' });
    }

    const normalize = (s) => (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const regions = [];
    const main = document.querySelector('main');
    const header = main?.querySelector('header') || document.querySelector('header');
    if (header) regions.push(header);
    if (main) regions.push(main); else regions.push(document);
    let btns = [];
    for (const r of regions) {
      btns = btns.concat(Array.from(r.querySelectorAll('button, [role="button"], a')));
    }
    for (const b of btns) {
      const t = normalize(b.innerText);
      const aria = normalize(b.getAttribute('aria-label'));
      const title = normalize(b.getAttribute('title'));
      const combo = `${t} ${aria} ${title}`;
      if (combo.includes('seguir de volta') || combo.includes('follow back')) {
        log('via=follow_back_button');
        return send({ followsYou: true, via: 'follow_back_button' });
      }
    }

    const text = regions.map(el => normalize(el.innerText)).join(' ');
    if (!text) {
      log('no indicator text');
      return send({ reason: 'no_indicator' });
    }

    const tokens = ['segue voce','follows you','te segue','segue te'];
    if (tokens.some(t => text.includes(t))) {
      log('via=text_indicator');
      return send({ followsYou: true, via: 'text_indicator' });
    }

    log('not following');
    send({ followsYou: false });
  } catch (e) {
    log('error', e?.message);
    send({ reason: 'error' });
  }
})();
