chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LIKE_REQUEST') {
    const username = msg.username;
    const originTabId = sender.tab ? sender.tab.id : null;
    chrome.tabs.create({ url: `https://www.instagram.com/${username}/`, active: true }, (tab) => {
      const tabId = tab.id;
      let responded = false;
      let timeoutId;

      const cleanUp = (result) => {
        if (responded) return;
        responded = true;
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(handleMessage);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        chrome.tabs.remove(tabId, () => {
          if (originTabId) chrome.tabs.update(originTabId, { active: true });
        });
        sendResponse({ result });
      };

      const handleUpdated = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(handleUpdated);
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['liker.js']
          });
        }
      };
      chrome.tabs.onUpdated.addListener(handleUpdated);

      const handleMessage = (response, senderInfo) => {
        if (
          senderInfo.tab &&
          senderInfo.tab.id === tabId &&
          (response.type === 'LIKE_DONE' || response.type === 'LIKE_SKIP')
        ) {
          cleanUp(response.type);
        }
      };
      chrome.runtime.onMessage.addListener(handleMessage);

      timeoutId = setTimeout(() => cleanUp('LIKE_SKIP'), 25000);
    });
    return true; // Keep the message channel open for sendResponse
  }
});
