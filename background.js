// background.js
// Service worker handling tab operations and profile follow checks

const CHECK_TIMEOUT = 15000; // 15s overall timeout

async function checkFollowsMe(username) {
  const result = await new Promise(async (resolve) => {
    let originalTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    let tempTab = await chrome.tabs.create({ url: `https://www.instagram.com/${username}/`, active: false });
    let tempTabId = tempTab.id;
    let done = false;
    let activated = false;

    const timer = setTimeout(() => finalize('timeout'), CHECK_TIMEOUT);

    function finalize(status) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onUpdated.removeListener(updateListener);
      if (tempTabId) chrome.tabs.remove(tempTabId);
      if (originalTab && originalTab.id) chrome.tabs.update(originalTab.id, { active: true });
      let result;
      if (status === 'FOLLOWS_YOU') result = { result: 'FOLLOWS_YOU' };
      else if (status === 'NOT_FOLLOWING') result = { result: 'NOT_FOLLOWING' };
      else result = { result: 'SKIP' };
      resolve(result);
    }

    function inject(attempt = 0) {
      chrome.scripting
        .executeScript({ target: { tabId: tempTabId }, files: ['checker.js'], world: 'MAIN' })
        .catch((err) => {
          console.log('[CHECK] inject error', err.message);
          if (/No frame|Frame.*removed/i.test(err.message) && attempt < 3) {
            setTimeout(() => inject(attempt + 1), 300);
          } else {
            finalize('error');
          }
        });
    }

    function messageListener(msg, sender) {
      if (!sender.tab || sender.tab.id !== tempTabId || msg.type !== 'CHECK_RESULT') return;
      console.log('[CHECK] result', msg.status);
      if (msg.status === 'not_visible' && !activated) {
        activated = true;
        chrome.tabs.update(tempTabId, { active: true }, () => setTimeout(() => inject(), 300));
        return;
      }
      finalize(msg.status);
    }

    function updateListener(tabId, info) {
      if (tabId === tempTabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(updateListener);
        inject();
      }
    }

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.tabs.onUpdated.addListener(updateListener);
  });

  return result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK_FOLLOWS_ME') {
    checkFollowsMe(msg.username).then(sendResponse);
    return true; // keep the message channel open
  }
});
