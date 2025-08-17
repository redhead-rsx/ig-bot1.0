try { console.log('[BOOT][CS]'); } catch (_) {}
let bot = window.__igBot || new Bot();
bot.criarOverlays();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'BOT_INIT') {
    try { console.log('[BOOT][BOT]'); } catch (_) {}
    const opts = msg.options || {};
    bot.start(opts.limit, opts.wantLike, opts.minDelay, opts.maxDelay);
    sendResponse({ ok: true });
  }
  if (msg.type === 'BOT_STOP') {
    bot.stop();
    sendResponse({ ok: true });
  }
  return true;
});
