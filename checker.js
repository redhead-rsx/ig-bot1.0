// checker.js
// Injected into profile page to determine if the user already follows the current account

(function () {
  const TOKENS = ['segue você', 'segue voce', 'follows you', 'te segue', 'segue-te'];
  const CLOSE_TOKENS = ['agora não', 'agora nao', 'not now', 'salvar informações', 'save info', 'ativar notificações', 'turn on notifications'];

  function normalize(text) {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function closeOverlays() {
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.forEach((btn) => {
      const t = normalize(btn.innerText);
      if (CLOSE_TOKENS.some((ct) => t.includes(ct))) {
        btn.click();
      }
    });
  }

  function check() {
    if (document.visibilityState !== 'visible') {
      chrome.runtime.sendMessage({ type: 'CHECK_RESULT', status: 'not_visible' });
      return;
    }
    closeOverlays();
    const region = document.querySelector('main header') || document.querySelector('main') || document.body;
    const text = normalize(region.innerText || '');
    const found = TOKENS.some((tok) => text.includes(tok));
    const status = found ? 'FOLLOWS_YOU' : 'NOT_FOLLOWING';
    chrome.runtime.sendMessage({ type: 'CHECK_RESULT', status });
  }

  if (document.readyState === 'complete') {
    setTimeout(check, 100);
  } else {
    window.addEventListener('load', () => setTimeout(check, 100));
  }
})();
