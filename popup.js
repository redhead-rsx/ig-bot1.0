chrome.storage.sync.get(['minDelay', 'maxDelay', 'limite', 'curtirFoto'], (data) => {
    document.getElementById('quantidade').value = data.limite || 10;
    document.getElementById('curtirFoto').checked = data.curtirFoto !== undefined ? data.curtirFoto : true;
    document.getElementById('minDelay').value = data.minDelay || 120;
    document.getElementById('maxDelay').value = data.maxDelay || 180;
});

function sendMessageToActiveTab(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, message);
    });
}

document.getElementById('startBtn').addEventListener('click', () => {
    const limite = parseInt(document.getElementById('quantidade').value) || 10;
    const curtirFoto = document.getElementById('curtirFoto').checked;
    const minDelay = parseInt(document.getElementById('minDelay').value) || 120;
    const maxDelay = parseInt(document.getElementById('maxDelay').value) || 180;

    chrome.storage.sync.set({ minDelay, maxDelay, limite, curtirFoto });

    sendMessageToActiveTab({ action: 'start', limite, curtirFoto, minDelay, maxDelay });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'stop' });
});
