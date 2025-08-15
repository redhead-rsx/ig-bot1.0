document.getElementById('startBtn').addEventListener('click', () => {
    const limite = parseInt(document.getElementById('quantidade').value) || 10;
    const curtirFoto = document.getElementById('curtirFoto').checked;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'start', limite, curtirFoto });
    });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' });
    });
});
