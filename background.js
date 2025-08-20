// Service worker MV3
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'LIKE_REQUEST' || !msg.username) return;

  const profileUrl = `https://www.instagram.com/${msg.username}/`;
  const bringToFront = !!msg.bringToFront;
  let tabId = null, prevTabId = null, done = false, timer = null, retried = false;
  const log = (...a) => console.log('[BG]', ...a);

  const cleanup = () => {
    try { chrome.runtime.onMessage.removeListener(onMsg); } catch (_) {}
    try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch (_) {}
    try { chrome.tabs.onRemoved.removeListener(onRemoved); } catch (_) {}
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
          log('inject error', err);
          if (/Frame .* was removed|No frame/i.test(err) && attempt < 4) return setTimeout(() => inject(attempt + 1), 350);
          return finalize('LIKE_SKIP');
        }
        try { chrome.tabs.sendMessage(tabId, { type: 'LIKE_REQUEST' }); } catch {}
      }
    );
  };

  const openAndWait = () => {
    chrome.tabs.update(tabId, { url: profileUrl }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) return finalize('LIKE_SKIP');
      if (bringToFront) {
        chrome.tabs.update(tabId, { active: true }, () => chrome.windows.update(tab.windowId, { focused: true }));
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  };

  const onMsg = (res, snd) => {
    if (!snd?.tab || snd.tab.id !== tabId) return;
    if (res?.type === 'LIKE_DONE') return finalize('LIKE_DONE');
    if (res?.type === 'LIKE_SKIP') {
      log('skip received', res.reason);
      if (!retried && ['interstitial_blocking', 'like_button_not_found', 'state_not_changed', 'open_failed'].includes(res.reason)) {
        retried = true;
        log('retrying');
        chrome.tabs.onUpdated.removeListener(onUpdated);
        openAndWait();
      } else {
        finalize('LIKE_SKIP');
      }
    }
  };

  const onUpdated = (id, info) => {
    if (id === tabId && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      const delay = 400 + Math.random() * 300;
      log('tab loaded, waiting', delay);
      setTimeout(() => inject(1), delay);
    }
  };

  const onRemoved = (id) => { if (id === tabId) finalize('LIKE_SKIP'); };

  timer = setTimeout(() => { log('timeout'); finalize('LIKE_SKIP'); }, 60000);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    prevTabId = tabs?.[0]?.id ?? null;
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.create({ url: profileUrl, active: bringToFront }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) return finalize('LIKE_SKIP');
      tabId = tab.id;
      log('tab created', tabId);
      if (bringToFront) {
        chrome.tabs.update(tabId, { active: true }, () => chrome.windows.update(tab.windowId, { focused: true }));
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });

  return true; // resposta assíncrona
});
