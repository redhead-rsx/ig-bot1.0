# IG Bot 1.0

Chrome extension for Instagram automation.

## Debug logging

`liker.js` can emit verbose logs to help troubleshoot actions. Debug logging is disabled by default. Enable or disable it using one of the following methods:

1. **Extension storage**
   ```js
   chrome.storage.local.set({ debug: true });  // enable
   chrome.storage.local.set({ debug: false }); // disable
   ```
   Run these commands from an extension page (for example, the popup's DevTools console). The setting persists between runs.

2. **Runtime message**
   ```js
   chrome.runtime.sendMessage({ type: 'SET_DEBUG', debug: true });  // enable
   chrome.runtime.sendMessage({ type: 'SET_DEBUG', debug: false }); // disable
   ```
   This updates the flag for active pages without touching storage.

When the debug flag is true, internal calls to `log` output messages prefixed with `[LIKER]` in the page console.
