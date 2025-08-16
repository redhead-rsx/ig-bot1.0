class Bot {
  constructor() {
    this.rodando = false;
    this.perfisSeguidos = 0;
    this.limite = 10;
    this.overlay = null;
    this.countdownInterval = null;
    this.curtirFoto = true;
  }

  criarOverlay() {
    if (!this.overlay) {
      this.overlay = document.createElement("div");
      this.overlay.id = "autoFollowOverlay";
      this.overlay.className = "auto-follow-overlay";
      this.overlay.innerText = "Aguardando início...";
      document.body.appendChild(this.overlay);
    }
  }

  atualizarOverlay(texto) {
    if (this.overlay) this.overlay.innerText = texto;
  }

  getRandomDelay() {
    return 120000 + Math.random() * 60000;
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

  async curtirPrimeiraFoto() {
    try {
      const primeiroPost = document.querySelector('article a');
      if (!primeiroPost) return false;

      primeiroPost.click();
      await new Promise(r => setTimeout(r, 1500));

      const btnCurtir = document.querySelector('svg[aria-label="Curtir"]');
      if (btnCurtir) btnCurtir.parentElement.click();

      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return true;
    } catch {
      return false;
    }
  }

  async seguirProximoUsuario() {
    if (!this.rodando) return;

    const modal = document.querySelector('div[role="dialog"]');
    if (!modal) {
      this.atualizarOverlay("Abra o modal de seguidores!");
      setTimeout(() => this.seguirProximoUsuario(), 1000);
      return;
    }

    const modalInterno = this.encontrarModalInterno(modal);
    if (!modalInterno) {
      this.atualizarOverlay("Não encontrou a div interna scrollável!");
      setTimeout(() => this.seguirProximoUsuario(), 1000);
      return;
    }

    const btn = Array.from(modalInterno.querySelectorAll('button'))
      .find(b => b.innerText.toLowerCase() === 'seguir' || b.innerText.toLowerCase() === 'follow');

    if (btn) {
      btn.click();
      this.perfisSeguidos++;
      this.atualizarOverlay(`Seguindo... (${this.perfisSeguidos}/${this.limite})`);

      if (this.curtirFoto) {
        await new Promise(r => setTimeout(r, 1500));
        await this.curtirPrimeiraFoto();
      }

      modalInterno.scrollTop += 70;
    } else {
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

  start(limiteParam, curtir) {
    if (this.rodando) return;
    this.rodando = true;
    this.perfisSeguidos = 0;
    this.limite = limiteParam || 10;
    this.curtirFoto = curtir !== undefined ? curtir : true;
    this.criarOverlay();
    this.seguirProximoUsuario();
  }

  stop() {
    this.rodando = false;
    this.atualizarOverlay("Automação parada");
    clearInterval(this.countdownInterval);
  }
}

const bot = new Bot();

