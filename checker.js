(async () => {
  const DEBUG = true;
  const log = (...a) => { try { if (DEBUG) console.log('[CHECK]', ...a); } catch(_) {} };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, { timeout = 8000, interval = 150 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch {}
      await sleep(interval);
    }
    return null;
  };
  const send = (result, reason) => {
    try {
      const obj = reason ? { type: 'CHECK_RESULT', result, reason } : { type: 'CHECK_RESULT', result };
      chrome.runtime.sendMessage(obj);
    } catch (_) {}
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
      return send('SKIP', 'not_visible');
    }

    const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const b of btns) {
      const t = normalize(b.innerText);
      const aria = normalize(b.getAttribute('aria-label'));
      const combo = `${t} ${aria}`;
      if (combo.includes('seguir de volta') || combo.includes('follow back')) {
        log('follow back button');
        return send('FOLLOWS_YOU');
      }
    }

    const areas = [];
    const main = document.querySelector('main');
    if (main) {
      areas.push(main);
      const header = main.querySelector('header');
      if (header) areas.push(header);
    }
    const text = areas.map(el => (el.innerText || '')).join(' ').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!text) {
      log('no indicator text');
      return send('SKIP', 'no_indicator');
    }

    const tokens = ['segue você','segue voce','follows you','te segue','segue-te'];
    if (tokens.some(t => text.includes(t))) {
      log('follows you');
      return send('FOLLOWS_YOU');
    }

    log('not following');
    send('NOT_FOLLOWING');
  } catch (e) {
    log('error', e?.message);
    send('SKIP', 'error');
  }
})();
