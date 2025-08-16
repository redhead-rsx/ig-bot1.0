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
    await waitFor(() => document.readyState === "complete");

    if (document.visibilityState !== "visible") {
      return send("LIKE_SKIP", "not_visible");
    }

    const text = document.body.innerText || "";
    if (/esta conta é privada|this account is private/i.test(text)) {
      return send("LIKE_SKIP", "private");
    }

    const main = document.querySelector("main");
    if (!main) return send("LIKE_SKIP", "no_post");

    let anchor =
      main.querySelector('article a[href*="/p/"]') ||
      main.querySelector('article a[href*="/reel/"]') ||
      main.querySelector('a[href*="/p/"], a[href*="/reel/"]');
    if (!anchor) {
      const img = main.querySelector("article img");
      if (img) anchor = img.closest('a,[role="button"]');
    }
    if (!anchor) return send("LIKE_SKIP", "no_post");

    const url = new URL(anchor.href || anchor.getAttribute("href"), location.origin);
    location.assign(url);
    await waitFor(() => /(\/p\/|\/reel\/)/.test(location.pathname), 10000);
    await waitFor(() => document.readyState === "complete");

    const likeSelector =
      'svg[aria-label*="Curtir"], svg[aria-label*="Like"], svg[aria-label*="Descurtir"], svg[aria-label*="Unlike"]';

    const findLike = () => {
      for (const article of document.querySelectorAll("article")) {
        const svg = article.querySelector(likeSelector);
        if (svg) return { article, svg, btn: svg.closest('button,[role="button"]') };
      }
      const svg = document.querySelector(likeSelector);
      return svg
        ? { article: svg.closest("article"), svg, btn: svg.closest('button,[role="button"]') }
        : null;
    };

    let likeObj = await waitFor(findLike, 5000);
    if (!likeObj || !likeObj.btn) return send("LIKE_SKIP", "no_post");

    const refresh = () => {
      likeObj = findLike() || likeObj;
    };

    const isLiked = () => {
      const label = likeObj.svg?.getAttribute("aria-label") || "";
      const pressed = likeObj.btn?.getAttribute("aria-pressed") === "true";
      return pressed || /Descurtir|Unlike/i.test(label);
    };

    let liked = isLiked();

    const robustClick = (el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const opts = {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
      el.click();
    };

    if (!liked && likeObj.btn) {
      robustClick(likeObj.btn);
      await sleep(500);
      refresh();
      liked = isLiked();
    }

    if (!liked && likeObj.svg) {
      robustClick(likeObj.svg);
      await sleep(500);
      refresh();
      liked = isLiked();
    }

    if (!liked && likeObj.article) {
      likeObj.article.focus();
      likeObj.article.dispatchEvent(
        new KeyboardEvent("keydown", { key: "l", bubbles: true })
      );
      await sleep(500);
      refresh();
      liked = isLiked();
    }

    if (!liked && likeObj.article) {
      const media = likeObj.article.querySelector("img, video");
      if (media) {
        robustClick(media);
        await sleep(50);
        robustClick(media);
        await sleep(500);
        refresh();
        liked = isLiked();
      }
    }

    if (liked) {
      send("LIKE_DONE");
    } else {
      send("LIKE_SKIP", "state_not_changed");
    }
  } catch (e) {
    send("LIKE_SKIP", "error");
  }
})();

