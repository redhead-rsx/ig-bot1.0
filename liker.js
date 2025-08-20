let DEBUG = false;
try {
  chrome.storage?.local?.get(['debug'], r => { DEBUG = !!r?.debug; });
} catch {}
const log = (...a) => { try { if (DEBUG) console.log('[LIKER]', ...a); } catch (_) {} };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitFor(fn, timeout = 8000, interval = 120) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const v = fn();
      if (v) return v;
    } catch {}
    await sleep(interval);
  }
  return null;
}

async function likeFirstMedia() {
  try {
    const profileRegex = /^https:\/\/www\.instagram\.com\/[^\/]+\/$/;
    if (!profileRegex.test(location.href)) {
      log('skip not_profile_page', location.href);
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'not_profile_page' });
    }

    const gridReady = await waitFor(() => document.querySelector('main a[href*="/p/"], main a[href*="/reel/"]'), 12000, 200);
    if (!gridReady) {
      log('skip no_clickable_media');
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'no_clickable_media' });
    }

    const anchors = Array.from(document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]'));
    let target = null;
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (/\/(p|reel)\//.test(href)) { target = a; break; }
    }
    if (!target) {
      log('skip no_clickable_media valid');
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'no_clickable_media' });
    }

    let mediaType = /\/reel\//.test(target.getAttribute('href')) ? 'reel' : 'photo';
    const openOnce = async () => {
      try { target.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
      await sleep(250 + Math.random() * 150);
      try { target.click(); } catch {}
      return await waitFor(() => {
        if (document.querySelector('[role="dialog"]')) return 'modal';
        if (/\/(p|reel)\//.test(location.pathname)) return 'page';
        return null;
      }, 8000, 200);
    };

    let opened = await openOnce();
    if (!opened) {
      await sleep(400);
      opened = await openOnce();
      if (!opened) {
        log('skip open_failed');
        return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'open_failed' });
      }
    }
    if (opened === 'page') {
      mediaType = /\/reel\//.test(location.pathname) ? 'reel' : 'photo';
    }

    let usedSelector = '';
    const findLikeBtn = () => {
      let el = document.querySelector('button[aria-label*="Curtir" i], button[aria-label*="Like" i]');
      if (el) { usedSelector = 'button[aria-label*="Curtir" i], button[aria-label*="Like" i]'; return el; }
      el = document.querySelector('svg[aria-label*="Curtir" i], svg[aria-label*="Like" i]');
      if (el) { usedSelector = 'svg[aria-label*="Curtir" i], svg[aria-label*="Like" i]'; return el.closest('button') || el; }
      el = document.querySelector('[data-testid*="like" i]');
      if (el) { usedSelector = '[data-testid*="like" i]'; return el.closest('button') || el; }
      return null;
    };

    const likeBtn = await waitFor(findLikeBtn, 5000, 120);
    if (!likeBtn) {
      log('skip like_button_not_found');
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'like_button_not_found' });
    }
    log('like button selector:', usedSelector);

    const label = () => (likeBtn.getAttribute('aria-label') || likeBtn.querySelector('svg')?.getAttribute('aria-label') || '').toLowerCase();
    if (/descurtir|unlike/.test(label())) {
      log('already liked');
      if (opened === 'modal') {
        const closeBtn = document.querySelector('button[aria-label*="Fechar" i], button[aria-label*="Close" i]');
        if (closeBtn) closeBtn.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else {
        history.back();
        await waitFor(() => profileRegex.test(location.href), 5000, 200);
      }
      return chrome.runtime.sendMessage({ type: 'LIKE_DONE', mediaType, alreadyLiked: true });
    }

    const clickAndCheck = async () => {
      try { likeBtn.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
      try { likeBtn.click(); } catch {}
      return await waitFor(() => /descurtir|unlike/.test(label()), 6000, 120);
    };

    let toggled = await clickAndCheck();
    if (!toggled) {
      await sleep(350 + Math.random() * 250);
      try { likeBtn.click(); } catch {}
      toggled = await waitFor(() => /descurtir|unlike/.test(label()), 6000, 120);
    }
    if (!toggled) {
      log('skip state_not_changed');
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'state_not_changed' });
    }

    if (opened === 'modal') {
      const closeBtn = document.querySelector('button[aria-label*="Fechar" i], button[aria-label*="Close" i]');
      if (closeBtn) closeBtn.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } else {
      history.back();
      await waitFor(() => profileRegex.test(location.href), 5000, 200);
    }

    chrome.runtime.sendMessage({ type: 'LIKE_DONE', mediaType });
  } catch (e) {
    log('error', e?.message);
    try { chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'error' }); } catch {}
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'LIKE_REQUEST') likeFirstMedia();
});
