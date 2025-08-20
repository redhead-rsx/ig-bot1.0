let DEBUG = false;
try {
  chrome.storage?.local?.get(['debug'], (r) => { DEBUG = !!r?.debug; });
} catch {}
const log = (...a) => {
  try { if (DEBUG) console.log('[LIKER]', ...a); } catch (_) {}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, timeout = 10000, step = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const v = pred();
      if (v) return v;
    } catch {}
    await sleep(step);
  }
  return null;
}

async function closeInterstitials() {
  const start = Date.now();
  while (Date.now() - start < 6000) {
    if (document.querySelector('form[action*="/accounts/login"], input[name="username"]')) {
      log('login_required');
      return { type: 'LIKE_SKIP', reason: 'login_required' };
    }
    let acted = false;
    const cookieBtn = [...document.querySelectorAll('button')].find(
      (b) => /aceitar|accept|allow/i.test(b.textContent) || (/cookies/i.test(b.textContent) && b.closest('[role="dialog"]'))
    );
    if (cookieBtn) {
      try { cookieBtn.click(); } catch {}
      acted = true;
    }
    const dialogClose = document.querySelector(
      '[role="dialog"] button[aria-label*="Fechar" i], [role="dialog"] button[aria-label*="Close" i], [role="dialog"] [aria-label*="Fechar" i], [role="dialog"] [aria-label*="Close" i]'
    );
    if (dialogClose) {
      try { dialogClose.click(); } catch {}
      acted = true;
    }
    const sensitiveBtn = [...document.querySelectorAll('button')].find((b) =>
      /ver foto|see photo|ver conteúdo|see content/i.test(b.textContent)
    );
    if (sensitiveBtn) {
      try { sensitiveBtn.click(); } catch {}
      acted = true;
    }
    if (!acted) await sleep(200);
  }
  if (document.querySelector('form[action*="/accounts/login"], input[name="username"]')) {
    return { type: 'LIKE_SKIP', reason: 'login_required' };
  }
  if (document.querySelector('[role="dialog"]')) {
    log('interstitial_blocking');
    return { type: 'LIKE_SKIP', reason: 'interstitial_blocking' };
  }
  return null;
}

async function closeMedia(opened) {
  if (opened === 'modal') {
    const closeBtn = document.querySelector('button[aria-label*="Fechar" i], button[aria-label*="Close" i]');
    if (closeBtn) {
      try { closeBtn.click(); } catch {}
    } else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
  } else {
    history.back();
    await waitFor(() => /^\/[A-Za-z0-9._]+\/?$/.test(location.pathname), 5000, 200);
  }
}

function rateLimited() {
  const texts = ['Tente novamente mais tarde', 'Try again later', 'Action blocked'];
  return [...document.querySelectorAll('div,span,p')].some((n) => texts.some((t) => n.textContent.includes(t)));
}

async function likeFirstMedia() {
  try {
    const inter = await closeInterstitials();
    if (inter) return chrome.runtime.sendMessage(inter);

    const path = location.pathname;
    const profileRegex = /^\/[A-Za-z0-9._]+\/?$/;
    if (!(profileRegex.test(path) || /^\/(p|reel)\//.test(path))) {
      log('not_profile_page', path);
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'not_profile_page' });
    }

    let mediaType = 'photo';
    let opened = 'page';
    let target = null;

    if (profileRegex.test(path)) {
      window.scrollTo(0, 0);
      await sleep(200);
      const start = Date.now();
      while (Date.now() - start < 12000) {
        const anchors = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].filter(
          (a) => a.offsetParent != null
        );
        if (anchors.length) {
          target = anchors[0];
          mediaType = /\/reel\//.test(target.getAttribute('href')) ? 'reel' : 'photo';
          break;
        }
        const y = window.scrollY;
        if (y < 600) window.scrollTo(0, 600);
        else if (y < 1200) window.scrollTo(0, 1200);
        await sleep(400);
      }
      if (!target) {
        log('no_clickable_media');
        return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'no_clickable_media' });
      }
      const openOnce = async () => {
        try { target.scrollIntoView({ block: 'center' }); } catch {}
        await sleep(250 + Math.random() * 250);
        try { target.click(); } catch {}
        return await waitFor(
          () =>
            document.querySelector('[role="dialog"] article, [role="dialog"] [data-testid="post-container"]')
              ? 'modal'
              : /^\/(p|reel)\//.test(location.pathname)
              ? 'page'
              : null,
          8000,
          200
        );
      };
      opened = await openOnce();
      if (!opened) {
        await sleep(400);
        opened = await openOnce();
      }
      if (!opened) {
        log('open_failed');
        return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'open_failed' });
      }
      if (opened === 'page') mediaType = /\/reel\//.test(location.pathname) ? 'reel' : 'photo';
    } else {
      mediaType = /\/reel\//.test(path) ? 'reel' : 'photo';
      opened = 'page';
    }

    const scope = opened === 'modal' ? document.querySelector('[role="dialog"]') : document;
    const findLikeBtn = () => {
      let el = scope.querySelector('button[aria-label*="Curtir" i], button[aria-label*="Like" i]');
      if (el) return el;
      el = scope.querySelector('button[aria-pressed] svg[aria-label*="Curtir" i], button[aria-pressed] svg[aria-label*="Like" i]');
      if (el) return el.closest('button');
      el = scope.querySelector('svg[aria-label*="Curtir" i], svg[aria-label*="Like" i]');
      if (el) return el.closest('button') || el;
      el = scope.querySelector('[data-testid*="like" i]');
      if (el) return el.closest('button') || el;
      el = Array.from(scope.querySelectorAll('[role="button"]')).find((b) =>
        b.querySelector('svg[aria-label*="Curtir" i], svg[aria-label*="Like" i]')
      );
      if (el) return el;
      return null;
    };
    const likeBtn = await waitFor(findLikeBtn, 6000, 120);
    if (!likeBtn) {
      log('like_button_not_found');
      await closeMedia(opened);
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'like_button_not_found' });
    }

    const state = () => {
      const aria = (likeBtn.getAttribute('aria-label') || '').toLowerCase();
      const pressed = likeBtn.getAttribute('aria-pressed');
      return {
        liked: pressed === 'true' || /descurtir|unlike/.test(aria),
        unliked: pressed === 'false' || /curtir|like/.test(aria),
      };
    };

    if (state().liked) {
      log('already_liked');
      await closeMedia(opened);
      return chrome.runtime.sendMessage({ type: 'LIKE_DONE', mediaType, alreadyLiked: true });
    }

    const clickCheck = async () => {
      try { likeBtn.scrollIntoView({ block: 'center' }); } catch {}
      try { likeBtn.click(); } catch {}
      await sleep(200 + Math.random() * 150);
      if (rateLimited()) return 'rate';
      return await waitFor(() => state().liked, 6000, 120);
    };

    let toggled = await clickCheck();
    if (toggled === 'rate') {
      await closeMedia(opened);
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'rate_limited' });
    }
    if (!toggled) {
      toggled = await clickCheck();
      if (toggled === 'rate') {
        await closeMedia(opened);
        return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'rate_limited' });
      }
    }
    if (!toggled) {
      log('state_not_changed');
      await closeMedia(opened);
      return chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'state_not_changed' });
    }

    await closeMedia(opened);
    chrome.runtime.sendMessage({ type: 'LIKE_DONE', mediaType });
  } catch (e) {
    log('error', e?.message);
    try { chrome.runtime.sendMessage({ type: 'LIKE_SKIP', reason: 'error' }); } catch {}
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'LIKE_REQUEST') likeFirstMedia();
});

