chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'start') bot.start(msg.limite, msg.curtirFoto);
    if (msg.action === 'stop') bot.stop();
});
