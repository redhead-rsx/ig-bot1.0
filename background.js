chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LIKE_REQUEST') {
    const username = msg.username;
    chrome.tabs.create({ url: `https://www.instagram.com/${username}/`, active: false }, (tab) => {
      const tabId = tab.id;

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
          chrome.runtime.onMessage.removeListener(handleMessage);
          chrome.tabs.remove(tabId);
          sendResponse({ result: response.type });
        }
      };
      chrome.runtime.onMessage.addListener(handleMessage);
    });
    return true; // Keep the message channel open for sendResponse
  }
});
