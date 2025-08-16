(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const firstPost = document.querySelector('a[href*="/p/"]');
  if (!firstPost) {
    chrome.runtime.sendMessage({ type: 'LIKE_SKIP' });
    return;
  }

  firstPost.click();
  await sleep(1500);

  const btnCurtir = document.querySelector('svg[aria-label="Curtir"], svg[aria-label="Like"]');
  if (btnCurtir && btnCurtir.closest('button')) {
    btnCurtir.closest('button').click();
    await sleep(1000);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    chrome.runtime.sendMessage({ type: 'LIKE_DONE' });
  } else {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    chrome.runtime.sendMessage({ type: 'LIKE_SKIP' });
  }
})();
