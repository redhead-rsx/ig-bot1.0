// Service worker MV3
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'LIKE_REQUEST' || !msg.username) return;

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
});

