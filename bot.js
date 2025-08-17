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
          padding: 10px 12px;
          border-radius: 6px;
          z-index: 999999;
          font: 12px/1.4 Arial, sans-serif;
          white-space: pre-line;
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        }
        #autoFollowLog {
          position: fixed;
          top: 20px;
          left: 20px;
          background: rgba(0,0,0,0.8);
          color: #fff;
          padding: 10px 12px;
          border-radius: 6px;
          z-index: 999999;
          font: 12px/1.4 Arial, sans-serif;
          max-height: 60vh;
          overflow-y: auto;
          white-space: pre-line;
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        }
      `;
      document.head.appendChild(style);
    }
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.id = 'autoFollowOverlay';
      this.overlay.textContent = 'Pronto.';
      document.body.appendChild(this.overlay);
    }
    if (!this.logOverlay) {
      this.logOverlay = document.createElement('div');
      this.logOverlay.id = 'autoFollowLog';
      this.logOverlay.textContent = 'Perfis seguidos:\n';
      document.body.appendChild(this.logOverlay);
    }
  }

  atualizarOverlay(texto) {
    if (!this.overlay) return;
    const extra = `\nLikes: ${this.likesOk} ok / ${this.likesSkip} skip`;
    this.overlay.textContent = `${texto}${extra}`;
  }

  addLog(username, badge = '') {
    if (!this.logOverlay) return;
    const line = badge ? `@${username} ${badge}\n` : `@${username}\n`;
    this.logOverlay.textContent += line;
    this.logOverlay.scrollTop = this.logOverlay.scrollHeight;
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

  async extractUsernameFromFollowButton(btn) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const bad = new Set(['p','reel','reels','explore','accounts','stories','direct','challenge','tv']);
    const notInsideBtn = (el) => !btn.contains(el);

    let current = btn;
    for (let i = 0; i < 8 && current; i++) {
      // 1) Anchors de perfil raiz fora do botão
      const anchors = Array.from(current.querySelectorAll('a[href^="/"][href$="/"]')).filter(notInsideBtn);
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^\/([^\/?#]+)\/$/);
        if (!m) continue;
        const seg = (m[1] || '').toLowerCase();
        if (!bad.has(seg)) return m[1];
      }
      // 2) Spans/divs curtos fora do botão
      const spanCandidate = Array.from(current.querySelectorAll('span[dir="auto"], div[dir="auto"]'))
        .filter(notInsideBtn)
        .map(s => (s.innerText || '').trim())
        .find(t => t && !t.includes(' ') && !/^@?seguir$|^@?following$|^@?follow$/i.test(t));
      if (spanCandidate) return spanCandidate.replace(/^@/, '');

      current = current.parentElement;
      await sleep(10);
    }
    return 'desconhecido';
  }

  requestLike(username) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'LIKE_REQUEST', username }, (resp) => {
          resolve(resp && resp.result);
        });
      } catch (e) {
        resolve('LIKE_SKIP');
      }
    });
  }


  requestCheckFollows(username) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'CHECK_FOLLOWS_ME', username }, (resp) => {
          resolve(resp && resp.result);
        });
      } catch (e) {
        resolve('SKIP');
      }
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

    let acted = false;
    const buttons = Array.from(modalInterno.querySelectorAll('button'));
    for (const btn of buttons) {
      const t = (btn.innerText || '').trim().toLowerCase();

      if (t === 'seguir de volta' || t === 'follow back') {
        const username = await this.extractUsernameFromFollowButton(btn);
        this.addLog(username, '⏭️ já segue (seguir de volta)');
        this.atualizarOverlay(`@${username} ⏭️ já segue (seguir de volta) (${this.perfisSeguidos}/${this.limite})`);
        modalInterno.scrollTop += 70;
        acted = true;
        break;
      }

      if (t === 'seguir' || t === 'follow') {
        const username = await this.extractUsernameFromFollowButton(btn);
        const check = await this.requestCheckFollows(username);
        if (check === 'FOLLOWS_YOU') {
          this.addLog(username, '⏭️ já segue você');
          this.atualizarOverlay(`@${username} ⏭️ já segue você (${this.perfisSeguidos}/${this.limite})`);
        } else {
          btn.click();
          this.perfisSeguidos++;
          this.addLog(username);

          if (this.curtirFoto) {
            this.atualizarOverlay(`Curtindo primeira foto de @${username}... (${this.perfisSeguidos}/${this.limite})`);
            const result = await this.requestLike(username);
            if (result === 'LIKE_DONE') { this.likesOk++; this.addLog(username, '♥️'); }
            else { this.likesSkip++; this.addLog(username, '⏭️'); }
          } else {
            this.atualizarOverlay(`Seguido @${username} (${this.perfisSeguidos}/${this.limite})`);
          }
        }

        modalInterno.scrollTop += 70;
        acted = true;
        break;
      }
    }

    if (!acted) {

      this.atualizarOverlay('Rolando modal...');
      const prevScroll = modalInterno.scrollTop;
      modalInterno.scrollTop += 60;
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
    this.likesOk = 0;
    this.likesSkip = 0;
    this.limite = limiteParam || 10;
    this.curtirFoto = curtir !== undefined ? curtir : true;
    const min = Number(minDelayParam || 120);
    const max = Number(maxDelayParam || 180);
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
// atalhos: p = pause/resume (recomeça com os mesmos parâmetros), x = stop
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'x') bot.stop();
  if (ev.key === 'p') {
    if (bot.rodando) { bot.stop(); }
    else { bot.start(bot.limite, bot.curtirFoto, bot.minDelay/1000, bot.maxDelay/1000); }
  }
});
window.__igBot = bot;
