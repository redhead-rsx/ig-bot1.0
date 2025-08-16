(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isPrivate = () => /esta conta é privada|this account is private/i.test(document.body.innerText);

  let opened = false;
  for (let i = 0; i < 15; i++) {
    if (isPrivate()) {
      chrome.runtime.sendMessage({ type: 'LIKE_SKIP' });
      return;
    }
    const firstThumb = document.querySelector('article a');
    if (firstThumb) {
      firstThumb.click();
      opened = true;
      break;
    }
    await sleep(1000);
  }

  if (!opened) {
    chrome.runtime.sendMessage({ type: 'LIKE_SKIP' });
    return;
  }

  await sleep(1500);

  let result = 'LIKE_DONE';
  const btnCurtir = document.querySelector('svg[aria-label="Curtir"], svg[aria-label="Like"]');
  if (btnCurtir && btnCurtir.closest('button')) {
    const btn = btnCurtir.closest('button');
    if (btn.getAttribute('aria-pressed') !== 'true') {
      btn.click();
      await sleep(500);
    }
  } else {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    await sleep(500);
  }

  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  chrome.runtime.sendMessage({ type: result });
})();
