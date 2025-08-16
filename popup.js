chrome.storage.sync.get(['minDelay', 'maxDelay'], (data) => {
    document.getElementById('minDelay').value = data.minDelay || 120;
    document.getElementById('maxDelay').value = data.maxDelay || 180;
});

document.getElementById('startBtn').addEventListener('click', () => {
    const limite = parseInt(document.getElementById('quantidade').value) || 10;
    const curtirFoto = document.getElementById('curtirFoto').checked;
    const minDelay = parseInt(document.getElementById('minDelay').value) || 120;
    const maxDelay = parseInt(document.getElementById('maxDelay').value) || 180;

    chrome.storage.sync.set({ minDelay, maxDelay });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'start', limite, curtirFoto, minDelay, maxDelay });
    });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' });
    });
});
