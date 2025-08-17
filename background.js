// Service worker MV3
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'FOLLOW_DEBUG') {
    try { console.info('[FOLLOW][SW]', msg); } catch(_) {}
    return;
  }

  // Novo fluxo de follow (segue no perfil e tenta like opcional)
  if (msg.type === 'FOLLOW_REQUEST' && msg.username) {
    const profileUrl = `https://www.instagram.com/${msg.username}/`;
    let tabId = null, prevTabId = null, done = false, timer = null, secondTry = false;

    const cleanup = () => {
      try { chrome.runtime.onMessage.removeListener(onMsg); } catch(_) {}
      try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch(_) {}
      try { chrome.tabs.onRemoved.removeListener(onRemoved); } catch(_) {}
      if (timer) clearTimeout(timer);
    };

    const finalize = (payload) => {
      if (done) return; done = true; cleanup();
      const finish = () => {
        if (prevTabId != null) chrome.tabs.update(prevTabId, { active: true }, () => sendResponse(payload));
        else sendResponse(payload);
      };
      if (tabId != null) chrome.tabs.remove(tabId, () => finish()); else finish();
    };

    const inject = (attempt = 1) => {
      chrome.scripting.executeScript(
        { target: { tabId }, func: (opts) => { window.__FOLLOW_OPTIONS = opts; }, args: [{ wantLike: !!msg.wantLike }] },
        () => {
          chrome.scripting.executeScript(
            { target: { tabId }, files: ['follow.js'], world: 'MAIN' },
            () => {
              const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
              if (err) {
                if (/Frame .* was removed|No frame/i.test(err) && attempt < 4) return setTimeout(() => inject(attempt + 1), 350);
                return finalize({ result: 'ERROR', reason: 'inject_error' });
              }
            }
          );
        }
      );
    };

    const onMsg = (res, snd) => {
      if (!snd?.tab || snd.tab.id !== tabId) return;
      if (res?.type === 'FOLLOW_RESULT') {
        if (!secondTry && (res.result === 'need_focus' || res.result === 'not_visible')) {
          secondTry = true;
          chrome.tabs.update(tabId, { active: true }, () => setTimeout(() => inject(1), 400));
          return;
        }
        finalize(res);
      }
    };

    const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(onUpdated); inject(1); } };
    const onRemoved = (id) => { if (id === tabId) finalize({ result: 'ERROR', reason: 'tab_closed' }); };

    timer = setTimeout(() => finalize({ result: 'ERROR', reason: 'timeout' }), 20000);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      prevTabId = tabs?.[0]?.id ?? null;
      chrome.runtime.onMessage.addListener(onMsg);
      chrome.tabs.onRemoved.addListener(onRemoved);
      chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
        if (chrome.runtime.lastError || !tab?.id) return finalize({ result: 'ERROR', reason: 'tab_create' });
        tabId = tab.id;
        chrome.tabs.onUpdated.addListener(onUpdated);
      });
    });

    return true; // resposta assíncrona
  }

  // Checagem se já segue
  if (msg.type === 'CHECK_FOLLOWS_ME' && msg.username) {
    const profileUrl = `https://www.instagram.com/${msg.username}/`;
    let tabId = null, prevTabId = null, done = false, timer = null, secondTry = false;
    const log = (...a) => { try { console.log('[BG]', ...a); } catch(_) {} };

    const cleanup = () => {
      try { chrome.runtime.onMessage.removeListener(onMsg); } catch(_) {}
      try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch(_) {}
      try { chrome.tabs.onRemoved.removeListener(onRemoved); } catch(_) {}
      if (timer) clearTimeout(timer);
    };
    const finalize = (result, info) => {
      if (done) return; done = true; cleanup();
      if (info) log(`result=${result}`, info); else log(`result=${result}`);
      const finish = () => {
        const payload = { result };
        if (result === 'FOLLOWS_YOU' && info) payload.via = info;
        else if (info) payload.reason = info;
        if (prevTabId != null) chrome.tabs.update(prevTabId, { active: true }, () => sendResponse(payload));
        else sendResponse(payload);
      };
      if (tabId != null) chrome.tabs.remove(tabId, () => finish()); else finish();
    };
    const inject = (attempt = 1) => {
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['checker.js'], world: 'MAIN' },
        () => {
          const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
          if (err) {
            log('inject error', err);
            if (/Frame .* was removed|No frame/i.test(err) && attempt < 4) return setTimeout(() => inject(attempt + 1), 350);
            return finalize('SKIP', 'inject_error');
          }
        }
      );
    };
    const onMsg = (res, snd) => {
      if (!snd?.tab || snd.tab.id !== tabId) return;
      if (res?.type === 'CHECK_DONE') {
        if (res.reason === 'not_visible' && !secondTry) {
          secondTry = true;
          chrome.tabs.update(tabId, { active: true }, () => setTimeout(() => inject(1), 400));
        } else if (res.followsYou === true) {
          finalize('FOLLOWS_YOU', res.via);
          return;
        } else if (res.followsYou === false) {
          finalize('NOT_FOLLOWING');
          return;
        } else {
          finalize('SKIP', res.reason || 'unknown');
          return;
        }
      }
    };
    const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(onUpdated); inject(1); } };
    const onRemoved = (id) => { if (id === tabId) finalize('SKIP', 'tab_closed'); };

    timer = setTimeout(() => finalize('SKIP', 'timeout'), 15000); // timeout total

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      prevTabId = tabs?.[0]?.id ?? null;
      chrome.runtime.onMessage.addListener(onMsg);
      chrome.tabs.onRemoved.addListener(onRemoved);
      chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
        if (chrome.runtime.lastError || !tab?.id) return finalize('SKIP', 'tab_create');
        tabId = tab.id;
        chrome.tabs.onUpdated.addListener(onUpdated);
      });
    });

    return true; // resposta assíncrona
  }

  // Fluxo de curtida existente
  if (msg.type === 'LIKE_REQUEST' && msg.username) {
    const profileUrl = `https://www.instagram.com/${msg.username}/`;
    let tabId = null, prevTabId = null, done = false, timer = null, secondTry = false;

    const cleanup = () => {
      try { chrome.runtime.onMessage.removeListener(onMsg); } catch(_) {}
      try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch(_) {}
      try { chrome.tabs.onRemoved.removeListener(onRemoved); } catch(_) {}
      if (timer) clearTimeout(timer);
    };
    const finalize = (result) => {
      if (done) return; done = true; cleanup();
      const finish = () => {
        if (prevTabId != null) chrome.tabs.update(prevTabId, { active: true }, () => sendResponse({ result }));
        else sendResponse({ result });
      };
      if (tabId != null) chrome.tabs.remove(tabId, () => finish()); else finish();
    };
    const inject = (attempt = 1) => {
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['liker.js'], world: 'MAIN' },
        () => {
          const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
          if (err) {
            if (/Frame .* was removed|No frame/i.test(err) && attempt < 4) return setTimeout(() => inject(attempt + 1), 350);
            return finalize('LIKE_SKIP');
          }
        }
      );
    };
    const onMsg = (res, snd) => {
      if (!snd?.tab || snd.tab.id !== tabId) return;
      if (res?.type === 'LIKE_DONE') return finalize('LIKE_DONE');
      if (res?.type === 'LIKE_SKIP') {
        if (!secondTry && (res.reason === 'not_visible' || res.reason === 'no_post')) {
          secondTry = true;
          chrome.tabs.update(tabId, { active: true }, () => setTimeout(() => inject(1), 400));
        } else {
          finalize('LIKE_SKIP');
        }
      }
    };
    const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(onUpdated); inject(1); } };
    const onRemoved = (id) => { if (id === tabId) finalize('LIKE_SKIP'); };

    timer = setTimeout(() => finalize('LIKE_SKIP'), 20000); // timeout total

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      prevTabId = tabs?.[0]?.id ?? null;
      chrome.runtime.onMessage.addListener(onMsg);
      chrome.tabs.onRemoved.addListener(onRemoved);
      chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
        if (chrome.runtime.lastError || !tab?.id) return finalize('LIKE_SKIP');
        tabId = tab.id;
        chrome.tabs.onUpdated.addListener(onUpdated);
      });
    });

    return true; // resposta assíncrona
  }
});
