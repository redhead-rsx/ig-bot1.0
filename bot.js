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
      this.overlay.innerText = 'Aguardando início...';
      document.body.appendChild(this.overlay);
    }

    if (!this.logOverlay) {
      this.logOverlay = document.createElement('div');
      this.logOverlay.id = 'autoFollowLog';
      this.logOverlay.innerText = 'Perfis seguidos:\n';
      document.body.appendChild(this.logOverlay);
    }
  }

  atualizarOverlay(texto) {
    if (this.overlay) this.overlay.innerText = texto;
  }

  addLog(username) {
    if (this.logOverlay) {
      this.logOverlay.innerText += `@${username}\n`;
      this.logOverlay.scrollTop = this.logOverlay.scrollHeight;
    }
  }

  getRandomDelay() {
    return this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
  }

  startCountdown(seconds) {
    clearInterval(this.countdownInterval);
    let remaining = seconds;

    this.countdownInterval = setInterval(() => {
      if (!this.rodando) {
        clearInterval(this.countdownInterval);
        return;
      }

      this.atualizarOverlay(`Aguardando ${remaining}s... (${this.perfisSeguidos}/${this.limite})`);

      if (remaining <= 0) {
        clearInterval(this.countdownInterval);
        this.seguirProximoUsuario();
      }

      remaining--;
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
        const match = link.getAttribute('href').match(/^\/([^\/]+)\//);
        if (match) return match[1];
      }
      const span = container.querySelector('span[dir="auto"]');
      if (span) return span.innerText.trim();
    }
    return 'desconhecido';
  }

  requestLike(username) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'LIKE_REQUEST', username }, (resp) => {
        resolve(resp && resp.result);
      });
    });
  }

  async seguirProximoUsuario() {
    if (!this.rodando) return;

    const modal = document.querySelector('div[role="dialog"]');
    if (!modal) {
      this.atualizarOverlay('Abra o modal de seguidores');
      setTimeout(() => this.seguirProximoUsuario(), 1000);
      return;
    }

    const modalInterno = this.encontrarModalInterno(modal);
    if (!modalInterno) {
      this.atualizarOverlay('Não encontrou a div interna scrollável');
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
      this.atualizarOverlay(`Seguindo @${username} (${this.perfisSeguidos}/${this.limite})`);
      this.addLog(username);

      if (this.curtirFoto) {
        this.atualizarOverlay(`Curtindo primeira foto de @${username}...`);
        await this.requestLike(username);
      }

      modalInterno.scrollTop += 70;
    } else {
      this.atualizarOverlay('Rolando modal...');
      const prevScroll = modalInterno.scrollTop;
      modalInterno.scrollTop += 50;

      setTimeout(() => {
        if (modalInterno.scrollTop === prevScroll) {
          this.atualizarOverlay(`Fim do modal ou todos os perfis carregados (${this.perfisSeguidos}/${this.limite})`);
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
      this.atualizarOverlay(`Limite atingido (${this.limite})`);
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
    this.atualizarOverlay('Automação parada');
    clearInterval(this.countdownInterval);
  }
}

const bot = new Bot();
