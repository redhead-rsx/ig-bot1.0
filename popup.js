document.getElementById('startBtn').addEventListener('click', () => {
    let limite = parseInt(document.getElementById('quantidade').value) || 10;
    if (limite > 200) limite = 200;
    if (limite < 1) limite = 1;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'start', limite });
    });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' });
    });
});
