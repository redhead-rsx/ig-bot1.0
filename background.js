// Service worker for Instagram bot
try { console.log('[BOOT][SW]', chrome.runtime.getManifest().version); } catch (_) {}

let igTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try { console.log('[MSG][SW]', msg && msg.type); } catch (_) {}
  if (!msg) return;

  if (msg.type === 'BOT_START') {
    const opts = msg.options || {};
    const initBot = (tabId) => {
      igTabId = tabId;
      chrome.tabs.sendMessage(tabId, { type: 'BOT_INIT', options: opts }, () => {
        sendResponse({ ok: true });
      });
    };
    chrome.tabs.query({ url: 'https://www.instagram.com/*', currentWindow: true }, (tabs) => {
      if (tabs && tabs.length) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true }, () => initBot(tab.id));
      } else {
        chrome.tabs.create({ url: 'https://www.instagram.com/', active: true }, (tab) => {
          if (!tab) return sendResponse({ ok: false });
          const listener = (id, info) => {
            if (id === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              initBot(tab.id);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      }
    });
    return true;
  }

  if (msg.type === 'BOT_STOP') {
    if (igTabId != null) {
      chrome.tabs.sendMessage(igTabId, { type: 'BOT_STOP' }, () => {});
      igTabId = null;
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'FOLLOW_DEBUG') {
    try { console.info('[FOLLOW][SW]', msg); } catch (_) {}
    return;
  }

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
      try { console.info('[FOLLOW][SW]', payload); } catch(_) {}
      const finish = () => {
        if (prevTabId != null) chrome.tabs.update(prevTabId, { active: true }, () => sendResponse(payload));
        else sendResponse(payload);
      };
      const close = () => { if (tabId != null) chrome.tabs.remove(tabId, () => finish()); else finish(); };
      close();
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
      if (res?.type === 'FOLLOW_DEBUG') {
        try { console.info('[FOLLOW][SW]', res); } catch(_) {}
        return;
      }
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
    return true;
  }
});
