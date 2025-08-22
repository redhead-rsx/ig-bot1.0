// Background service worker for auto-follow backoff
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AF_SET_ALARM') {
    chrome.alarms.create('autoFollowResume', { when: msg.pausedUntil });
  }
  if (msg.type === 'AF_CLEAR_ALARM') {
    chrome.alarms.clear('autoFollowResume');
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoFollowResume') {
    chrome.storage.local.get('af_state', (data) => {
      const state = data.af_state || {};
      if (state.running) {
        state.pausedUntil = 0;
        chrome.storage.local.set({ af_state: state }, () => {
          chrome.tabs.query({ url: 'https://www.instagram.com/*' }, (tabs) => {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, { type: 'AF_RESUME' });
            }
          });
        });
      }
    });
  }
});
