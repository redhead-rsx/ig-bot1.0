chrome.storage.sync.get(['minDelay', 'maxDelay', 'limite'], (data) => {
    document.getElementById('quantidade').value = data.limite || 10;
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
    const minDelay = parseInt(document.getElementById('minDelay').value) || 120;
    const maxDelay = parseInt(document.getElementById('maxDelay').value) || 180;

    chrome.storage.sync.set({ minDelay, maxDelay, limite });

    sendMessageToActiveTab({ action: 'start', limite, minDelay, maxDelay });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    sendMessageToActiveTab({ action: 'stop' });
});
