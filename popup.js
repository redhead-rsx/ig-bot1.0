// Boot log and message routing for popup

document.addEventListener('DOMContentLoaded', () => {
  try { console.log('[BOOT][POPUP]'); } catch (_) {}

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');

  const loadOpts = () => new Promise(resolve => {
    try {
      chrome.storage.sync.get(['limite','minDelay','maxDelay','curtirFoto'], data => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.get(['limite','minDelay','maxDelay','curtirFoto'], resolve);
        } else {
          resolve(data);
        }
      });
    } catch (e) {
      chrome.storage.local.get(['limite','minDelay','maxDelay','curtirFoto'], resolve);
    }
  });

  const saveOpts = (opts) => {
    try {
      chrome.storage.sync.set(opts, () => {
        if (chrome.runtime.lastError) chrome.storage.local.set(opts, () => {});
      });
    } catch (_) {
      chrome.storage.local.set(opts, () => {});
    }
  };

  loadOpts().then(data => {
    document.getElementById('quantidade').value = data.limite || 10;
    document.getElementById('minDelay').value = data.minDelay || 120;
    document.getElementById('maxDelay').value = data.maxDelay || 180;
    document.getElementById('curtirFoto').checked = data.curtirFoto !== undefined ? data.curtirFoto : true;
  });

  const enableStart = () => { startBtn.disabled = false; };
  const disableStart = () => { startBtn.disabled = true; };
  const enableStop = () => { stopBtn.disabled = false; };
  const disableStop = () => { stopBtn.disabled = true; };

  disableStop();
  let isRunning = false;

  startBtn.addEventListener('click', () => {
    if (isRunning) return;
    const opts = {
      limit: parseInt(document.getElementById('quantidade').value) || 10,
      minDelay: parseInt(document.getElementById('minDelay').value) || 120,
      maxDelay: parseInt(document.getElementById('maxDelay').value) || 180,
      wantLike: document.getElementById('curtirFoto').checked
    };
    saveOpts({ limite: opts.limit, minDelay: opts.minDelay, maxDelay: opts.maxDelay, curtirFoto: opts.wantLike });
    disableStart();
    enableStop();
    isRunning = true;
    chrome.runtime.sendMessage({ type: 'BOT_START', options: opts }, (resp) => {
      if (!(resp && resp.ok)) {
        isRunning = false;
        enableStart();
        disableStop();
      } else {
        statusEl.textContent = 'Rodando';
      }
    });
  });

  stopBtn.addEventListener('click', () => {
    if (!isRunning) return;
    disableStop();
    enableStart();
    chrome.runtime.sendMessage({ type: 'BOT_STOP' }, (resp) => {
      isRunning = false;
      statusEl.textContent = 'Parado';
    });
  });
});
