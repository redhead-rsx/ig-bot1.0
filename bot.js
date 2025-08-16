class Bot {
  constructor() {
    this.rodando = false;
    this.perfisSeguidos = 0;
    this.limite = 10;
    this.overlay = null; // overlay inferior direito
    this.logOverlay = null; // overlay superior esquerdo
    this.countdownInterval = null;
    this.curtirFoto = true;
    this.minDelay = 120000;
    this.maxDelay = 180000;
    this.likesOk = 0;
    this.likesSkip = 0;
    this.paused = false;
    this.remaining = 0;
  }

  criarOverlays() {
    if (!document.getElementById('autoFollowStyles')) {
      const style = document.createElement('style');
      style.id = 'autoFollowStyles';
      style.textContent = `
        #autoFollowOverlay {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: rgba(0,0,0,0.8);
          color: #fff;
          padding: 10px;
          border-radius: 5px;
          z-index: 99999;
          font-family: Arial, sans-serif;
          font-size: 14px;
          white-space: pre-line;
        }
        #autoFollowLog {
          position: fixed;
          top: 20px;
          left: 20px;
          background: rgba(0,0,0,0.8);
          color: #fff;
          padding: 10px;
          border-radius: 5px;
          z-index: 99999;
          font-family: Arial, sans-serif;
          font-size: 14px;
          max-height: 60vh;
          overflow-y: auto;
          white-space: pre-line;
        }
      `;
      document.head.appendChild(style);
    }

    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.id = 'autoFollowOverlay';
      document.body.appendChild(this.overlay);
    }

    if (!this.logOverlay) {
      this.logOverlay = document.createElement('div');
      this.logOverlay.id = 'autoFollowLog';
      this.logOverlay.innerText = 'Perfis seguidos:\n';
      document.body.appendChild(this.logOverlay);
    }

    this.setStatus('Aguardando início...');
  }

  setStatus(texto) {
    if (this.overlay)
      this.overlay.innerText = `${texto}\nSeguidos: ${this.perfisSeguidos}/${this.limite}\n♥️ ${this.likesOk} ⏭️ ${this.likesSkip}`;
  }

  addLog(username, badge = '') {
    if (this.logOverlay) {
      this.logOverlay.innerText += `@${username} ${badge}\n`;
      this.logOverlay.scrollTop = this.logOverlay.scrollHeight;
    }
  }

  getRandomDelay() {
    return this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
  }

  startCountdown(seconds) {
    clearInterval(this.countdownInterval);
    let remaining = seconds;
    this.remaining = remaining;

    this.countdownInterval = setInterval(() => {
      if (!this.rodando) {
        clearInterval(this.countdownInterval);
        return;
      }

      if (this.paused) {
        this.setStatus(`Pausado (${remaining}s)`);
        return;
      }

      this.setStatus(`Aguardando ${remaining}s...`);

      if (remaining <= 0) {
        clearInterval(this.countdownInterval);
        this.seguirProximoUsuario();
      }

      remaining--;
      this.remaining = remaining;
    }, 1000);
  }

  encontrarModalInterno(modal) {
    const divs = modal.querySelectorAll('div');
    for (let div of divs) {
      if (div.scrollHeight > div.clientHeight) {
        return div;
      }
    }
    return null;
  }

  extrairUsername(btn) {
    const container = btn.closest('li') || btn.parentElement;
    if (container) {
      const link = container.querySelector('a[href^="/"]');
      if (link) {
        const match = link.getAttribute('href').match(/^\/([^\/]+)/);
        if (match) return match[1];
        if (link.innerText) return link.innerText.trim();
      }
      const span = container.querySelector('span[dir="auto"]');
      if (span && span.innerText) return span.innerText.trim();
      const txt = container.innerText.replace(/\n/g, ' ').trim();
      if (txt) return txt.split(' ')[0].replace('@', '');
    }
    return 'usuario';
  }

  requestLike(username) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'LIKE_REQUEST', username }, (resp) => {
        resolve((resp && resp.result) || 'LIKE_SKIP');
      });
    });
  }

  async seguirProximoUsuario() {
    if (!this.rodando) return;

    const modal = document.querySelector('div[role="dialog"]');
    if (!modal) {
      this.setStatus('Abra o modal de seguidores');
      setTimeout(() => this.seguirProximoUsuario(), 1000);
      return;
    }

    const modalInterno = this.encontrarModalInterno(modal);
    if (!modalInterno) {
      this.setStatus('Não encontrou a div interna scrollável');
      setTimeout(() => this.seguirProximoUsuario(), 1000);
      return;
    }

    const btn = Array.from(modalInterno.querySelectorAll('button')).find((b) => {
      const t = b.innerText.trim().toLowerCase();
      return t === 'seguir' || t === 'follow';
    });

    if (btn) {
      const username = this.extrairUsername(btn);
      btn.click();
      this.perfisSeguidos++;
      this.setStatus(`Seguindo @${username}`);
      let badge = '';

      if (this.curtirFoto) {
        this.setStatus(`Curtindo primeira foto de @${username}...`);
        const result = await this.requestLike(username);
        if (result === 'LIKE_DONE') {
          this.likesOk++;
          badge = '♥️';
        } else {
          this.likesSkip++;
          badge = '⏭️';
        }
      }

      this.addLog(username, badge);
      this.setStatus(`Seguido @${username}`);
      modalInterno.scrollTop += 70;
    } else {
      this.setStatus('Rolando modal...');
      const prevScroll = modalInterno.scrollTop;
      modalInterno.scrollTop += 50;

      setTimeout(() => {
        if (modalInterno.scrollTop === prevScroll) {
          this.setStatus(`Fim do modal ou todos os perfis carregados`);
          this.rodando = false;
          clearInterval(this.countdownInterval);
          return;
        }
        this.seguirProximoUsuario();
      }, 1500);
      return;
    }

    if (this.perfisSeguidos >= this.limite) {
      this.rodando = false;
      this.setStatus(`Limite atingido (${this.limite})`);
      clearInterval(this.countdownInterval);
      return;
    }

    const delaySegundos = Math.floor(this.getRandomDelay() / 1000);
    this.startCountdown(delaySegundos);
  }

  start(limiteParam, curtir, minDelayParam, maxDelayParam) {
    if (this.rodando) return;
    this.rodando = true;
    this.perfisSeguidos = 0;
    this.likesOk = 0;
    this.likesSkip = 0;
    this.paused = false;
    this.limite = limiteParam || 10;
    this.curtirFoto = curtir !== undefined ? curtir : true;
    const min = minDelayParam || 120;
    const max = maxDelayParam || 180;
    this.minDelay = Math.min(min, max) * 1000;
    this.maxDelay = Math.max(min, max) * 1000;
    this.criarOverlays();
    this.seguirProximoUsuario();
  }

  stop() {
    this.rodando = false;
    this.paused = false;
    this.setStatus('Automação parada');
    clearInterval(this.countdownInterval);
  }

  togglePause() {
    if (!this.rodando) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.setStatus('Pausado');
    } else {
      this.setStatus('Retomando...');
    }
  }
}

const bot = new Bot();
window.__igBot = bot;
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
  if (e.key === 'p') bot.togglePause();
  if (e.key === 'x') bot.stop();
});
