chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LIKE_REQUEST') {
    const username = msg.username;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const originTabId = tabs[0] ? tabs[0].id : null;

      chrome.tabs.create(
        {
          url: `https://www.instagram.com/${username}/`,
          active: false,
        },
        (tab) => {
          const tabId = tab.id;
          let done = false;
          let activated = false;
          let timeoutId;

          const finalize = (result) => {
            if (done) return;
            done = true;
            clearTimeout(timeoutId);
            chrome.runtime.onMessage.removeListener(handleMessage);
            chrome.tabs.onUpdated.removeListener(handleUpdated);
            chrome.tabs.remove(tabId, () => {
              if (originTabId) chrome.tabs.update(originTabId, { active: true });
            });
            sendResponse({ result });
          };

          const inject = (attempt = 1) => {
            chrome.scripting.executeScript(
              { target: { tabId }, files: ['liker.js'] },
              () => {
                const err = chrome.runtime.lastError;
                if (
                  err &&
                  /Frame.*was removed|No frame/i.test(err.message || '') &&
                  attempt < 3
                ) {
                  setTimeout(() => inject(attempt + 1), 350);
                }
              }
            );
          };

          const handleUpdated = (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(handleUpdated);
              inject();
            }
          };
          chrome.tabs.onUpdated.addListener(handleUpdated);

          const handleMessage = (response, senderInfo) => {
            if (senderInfo.tab && senderInfo.tab.id === tabId) {
              if (response.type === 'LIKE_DONE') {
                finalize('LIKE_DONE');
              } else if (response.type === 'LIKE_SKIP') {
                if (
                  !activated &&
                  (response.reason === 'not_visible' || response.reason === 'no_post')
                ) {
                  activated = true;
                  chrome.tabs.update(tabId, { active: true }, () => {
                    setTimeout(() => inject(), 400);
                  });
                } else {
                  finalize('LIKE_SKIP');
                }
              }
            }
          };
          chrome.runtime.onMessage.addListener(handleMessage);

          timeoutId = setTimeout(() => finalize('LIKE_SKIP'), 20000);
        }
      );
    });

    return true; // Keep the message channel open for sendResponse
  }
});
