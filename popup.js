chrome.storage.sync.get(['minDelay', 'maxDelay', 'limite'], (data) => {
    document.getElementById('quantidade').value = data.limite || 10;
    document.getElementById('minDelay').value = data.minDelay || 120;
    document.getElementById('maxDelay').value = data.maxDelay || 180;
});

function refreshStatus() {
    chrome.storage.local.get('af_state', (data) => {
        const state = data.af_state || {};
        const el = document.getElementById('afStatus');
        let text = 'Parado';
        if (state.running) {
            if (state.pausedUntil && state.pausedUntil > Date.now()) {
                text = 'Pausado até ' + new Date(state.pausedUntil).toLocaleTimeString();
            } else {
                text = 'Rodando';
            }
        } else if (state.stage >= 2) {
            text = 'Finalizado por limite';
        }
        el.textContent = text;
    });
}

refreshStatus();

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.af_state) refreshStatus();
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

    chrome.storage.local.get('af_state', (data) => {
        const st = data.af_state || {};
        chrome.storage.local.set({ af_state: { ...st, running: true, pausedUntil: 0, consecutiveFails: 0 } }, () => {
            chrome.runtime.sendMessage({ type: 'AF_CLEAR_ALARM' });
            sendMessageToActiveTab({ action: 'start', limite, minDelay, maxDelay });
            refreshStatus();
        });
    });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.storage.local.set(
        { af_state: { running: false, pausedUntil: 0, consecutiveFails: 0, stage: 0, totalFails: 0 } },
        () => {
            chrome.runtime.sendMessage({ type: 'AF_CLEAR_ALARM' });
            sendMessageToActiveTab({ action: 'stop' });
            refreshStatus();
        }
    );
});

function runtimeSend(msg){
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function updateAuthUI() {
    const status = await runtimeSend({ type: 'AUTH_STATUS' });
    const loginView = document.getElementById('loginView');
    const appView = document.getElementById('appView');
    const loginMsg = document.getElementById('loginMsg');
    const lockUntil = status.auth_lockUntil || 0;
    const now = status.now || Date.now();
    loginMsg.textContent = '';
    if (lockUntil && lockUntil > now) {
        loginView.style.display = 'block';
        appView.style.display = 'none';
        loginMsg.textContent = 'Bloqueado até ' + new Date(lockUntil).toLocaleTimeString();
        return;
    }
    const auth = status.auth || { state: 'NONE' };
    if (auth.state === 'AUTH' && (!auth.exp || auth.exp > now)) {
        loginView.style.display = 'none';
        appView.style.display = 'block';
        refreshStatus();
    } else {
        loginView.style.display = 'block';
        appView.style.display = 'none';
    }
}

document.getElementById('loginBtn').addEventListener('click', async () => {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const res = await runtimeSend({ type: 'AUTH_LOGIN', user, pass });
    if (res.ok) {
        document.getElementById('loginPass').value = '';
        updateAuthUI();
    } else if (res.error === 'LOCKED_UNTIL') {
        document.getElementById('loginMsg').textContent = 'Bloqueado até ' + new Date(res.lockUntil).toLocaleTimeString();
    } else {
        let msg = 'Usuário ou senha inválidos';
        if (res.lockUntil) msg += ' Bloqueado até ' + new Date(res.lockUntil).toLocaleTimeString();
        document.getElementById('loginMsg').textContent = msg;
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await runtimeSend({ type: 'AUTH_LOGOUT' });
    updateAuthUI();
});

updateAuthUI();

