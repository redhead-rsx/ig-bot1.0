// Script responsável por curtir a primeira publicação de um perfil
// É injetado pelo background em uma aba de perfil ou diretamente no post
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 20000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  };
  const send = (type, reason) =>
    chrome.runtime.sendMessage(reason ? { type, reason } : { type });

  try {
    await waitFor(() => document.readyState === 'complete');

    if (document.visibilityState !== 'visible') {
      return send('LIKE_SKIP', 'not_visible');
    }

    const text = document.body.innerText || '';
    if (/esta conta é privada|this account is private/i.test(text)) {
      return send('LIKE_SKIP', 'private');
    }

    const main = document.querySelector('main');
    if (!main) return send('LIKE_SKIP', 'no_post');

    let anchor =
      main.querySelector('article a[href*="/p/"]') ||
      main.querySelector('article a[href*="/reel/"]') ||
      main.querySelector('a[href*="/p/"], a[href*="/reel/"]');
    if (!anchor) {
      const img = main.querySelector('article img');
      if (img) {
        anchor = img.closest('a,[role="button"]');
      }
    }
    if (!anchor) return send('LIKE_SKIP', 'no_post');

    const url = new URL(anchor.getAttribute('href'), location.origin);
    location.assign(url);
    await waitFor(() => /(\/p\/|\/reel\/)/.test(location.pathname), 10000);
    await waitFor(() => document.readyState === 'complete');

    const article = await waitFor(() => document.querySelector('article'));
    if (!article) return send('LIKE_SKIP', 'no_post');

    const getBtn = () => {
      const svg = article.querySelector(
        'svg[aria-label="Curtir"], svg[aria-label="Like"], svg[aria-label="Descurtir"], svg[aria-label="Unlike"]'
      );
      return { svg, btn: svg ? svg.closest('button,[role="button"]') : null };
    };

    const isLiked = ({ svg, btn }) => {
      const label = svg ? svg.getAttribute('aria-label') || '' : '';
      return (
        (btn && btn.getAttribute('aria-pressed') === 'true') ||
        /Descurtir|Unlike/i.test(label)
      );
    };

    let { svg, btn } = getBtn();
    let liked = isLiked({ svg, btn });

    const tryClick = async (target) => {
      if (!target) return;
      target.click();
      await sleep(500);
      ({ svg, btn } = getBtn());
      liked = isLiked({ svg, btn });
    };

    if (!liked && btn) {
      await tryClick(btn);
      if (!liked && svg) await tryClick(svg);
    }

    if (!liked) {
      article.click();
      article.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'l', bubbles: true })
      );
      await sleep(500);
      ({ svg, btn } = getBtn());
      liked = isLiked({ svg, btn });
    }

    if (!liked) {
      const media = article.querySelector('img, video');
      if (media) {
        const rect = media.getBoundingClientRect();
        const opts = {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        };
        media.dispatchEvent(new MouseEvent('click', opts));
        media.dispatchEvent(new MouseEvent('click', opts));
        await sleep(500);
        ({ svg, btn } = getBtn());
        liked = isLiked({ svg, btn });
      }
    }

    if (liked) {
      send('LIKE_DONE');
    } else {
      send('LIKE_SKIP', 'state_not_changed');
    }
  } catch (e) {
    send('LIKE_SKIP', 'error');
  }
})();
