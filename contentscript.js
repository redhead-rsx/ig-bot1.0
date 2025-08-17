chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'start') bot.start(msg.limite, msg.curtirFoto, msg.minDelay, msg.maxDelay);
    if (msg.action === 'stop') bot.stop();
});