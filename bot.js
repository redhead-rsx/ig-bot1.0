const normalize = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

const getFollowersContext = () => {
  const modal = document.querySelector('div[role="dialog"], div[aria-modal="true"]');
  if (modal) {
    const scroller = [...modal.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight) || modal;
    return { container: modal, scroller, type: 'modal' };
  }
  if (/\/followers\/?$/.test(location.pathname)) {
    const main = document.querySelector('main') || document.body;
    const candidate = [...main.querySelectorAll('section, div')].find(el => {
      const btns = el.querySelectorAll('button, [role="button"]');
      if (btns.length < 5) return false;
      const txts = [...btns].map(b => normalize(b.innerText));
      return txts.some(t => t === 'seguir' || t === 'follow' || t === 'seguir de volta' || t === 'follow back');
    }) || main;
    const scroller = [...candidate.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight) || document.scrollingElement || document.documentElement;
    return { container: candidate, scroller, type: 'page' };
  }
  return null;
};

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
    this.followGateOpen = true;
    this.currentJobId = 0;
    this.nextActionTimer = null;
    this.logCounter = 0;
    this.dialogObserver = null;
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
    this.logCounter += 1;
    const line = badge ? `@${username} ${badge}\n` : `@${username}\n`;
    this.logOverlay.textContent += line;
    this.logOverlay.scrollTop = this.logOverlay.scrollHeight;
    try { console.log(`[LOG ${this.logCounter}] @${username} ${badge}`); } catch (_) {}
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

  requestFollow(username, wantLike) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'FOLLOW_REQUEST', username, wantLike }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ result: 'ERROR' });
          } else {
            resolve(resp || { result: 'ERROR' });
          }
        });
      } catch (e) {
        resolve({ result: 'ERROR' });
      }
    });
  }

  async seguirProximoUsuario() {
    if (!this.rodando || !this.followGateOpen) return;
    const jobId = ++this.currentJobId;
    if (this.nextActionTimer) { clearTimeout(this.nextActionTimer); this.nextActionTimer = null; }
    clearInterval(this.countdownInterval);
    const ctx = getFollowersContext();
    if (!ctx) {
      this.atualizarOverlay('Abra o modal de seguidores ou vá para /followers/');
      if (!this.dialogObserver) {
        this.dialogObserver = new MutationObserver(() => {
          const c = getFollowersContext();
          if (c) {
            try { this.dialogObserver.disconnect(); } catch {}
            this.dialogObserver = null;
            this.seguirProximoUsuario();
          }
        });
        try { this.dialogObserver.observe(document.body, { childList: true, subtree: true }); } catch {}
      }
      this.nextActionTimer = setTimeout(() => { this.nextActionTimer = null; this.seguirProximoUsuario(); }, 1000);
      return;
    }
    if (this.dialogObserver) {
      try { this.dialogObserver.disconnect(); } catch {}
      this.dialogObserver = null;
    }
    const modalInterno = ctx.scroller;

    let acted = false;
    const buttons = Array.from(modalInterno.querySelectorAll('button, [role="button"]'));
    for (const btn of buttons) {
      const t = normalize(btn.innerText);
      if (t === 'seguir de volta' || t === 'follow back') {
        continue;
      }
      if (t === 'seguir' || t === 'follow') {
        const username = await this.extractUsernameFromFollowButton(btn);
        if (!username || username === 'desconhecido') {
          this.addLog('desconhecido', '⚠️');
          this.atualizarOverlay(`@desconhecido ⚠️ (${this.perfisSeguidos}/${this.limite})`);
          console.log('[BOT] username desconhecido, pulando');
          continue;
        }
        const user = username;
        console.log(`[BOT] follow start @${user} job=${jobId}`);
        this.followGateOpen = false;
        const resp = await this.requestFollow(user, this.curtirFoto);
        if (jobId !== this.currentJobId) {
          console.log('[BOT] stale job, ignoring');
          this.followGateOpen = true;
          return;
        }
        const result = resp.result;
        console.log(`[BOT] follow result=${result} job=${jobId}`);
        if (result === 'ALREADY_FOLLOWS' || result === 'ALREADY_FOLLOWING') {
          this.addLog(user, '⏭️ já segue');
          this.atualizarOverlay(`@${user} ⏭️ já segue (${this.perfisSeguidos}/${this.limite})`);
        } else if (result === 'FOLLOW_DONE') {
          this.perfisSeguidos++;
          if (resp.like === 'DONE') {
            this.likesOk++;
            this.addLog(user, '♥️');
            this.atualizarOverlay(`@${user} seguido ♥️ (${this.perfisSeguidos}/${this.limite})`);
          } else if (resp.like === 'SKIP') {
            this.likesSkip++;
            this.addLog(user, '⏭️');
            this.atualizarOverlay(`@${user} seguido ⏭️ (${this.perfisSeguidos}/${this.limite})`);
          } else {
            this.addLog(user);
            this.atualizarOverlay(`@${user} seguido (${this.perfisSeguidos}/${this.limite})`);
          }
        } else if (result === 'FOLLOW_REQUESTED') {
          this.perfisSeguidos++;
          this.addLog(user, '📨');
          this.atualizarOverlay(`@${user} 📨 solicitado (${this.perfisSeguidos}/${this.limite})`);
        } else if (result === 'NO_FOLLOW_BUTTON' || result === 'SKIP_NO_ACTION' || result === 'ERROR') {
          this.addLog(user, '⚠️');
          this.atualizarOverlay(`@${user} ⚠️ erro (${this.perfisSeguidos}/${this.limite})`);
        } else {
          this.addLog(user, '⏭️');
          this.atualizarOverlay(`@${user} ⏭️ (${this.perfisSeguidos}/${this.limite})`);
        }
        this.followGateOpen = true;
        if (modalInterno === document.scrollingElement || modalInterno === document.documentElement || modalInterno === document.body) {
          window.scrollBy(0, 70);
        } else {
          modalInterno.scrollTop += 70;
        }
        acted = true;
        break;
      }
    }

    if (!acted) {
      this.atualizarOverlay('Rolando modal...');
      const useWindow = (modalInterno === document.scrollingElement || modalInterno === document.documentElement || modalInterno === document.body);
      const prevScroll = useWindow ? window.scrollY : modalInterno.scrollTop;
      if (useWindow) { window.scrollBy(0, 60); } else { modalInterno.scrollTop += 60; }
      this.nextActionTimer = setTimeout(() => {
        this.nextActionTimer = null;
        const curr = useWindow ? window.scrollY : modalInterno.scrollTop;
        if (curr === prevScroll) {
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
    if (this.logOverlay) {
      this.logOverlay.textContent = '';
      this.logCounter = 0;
    }
    this.seguirProximoUsuario();
  }

  stop() {
    this.rodando = false;
    this.atualizarOverlay('Automação parada');
    clearInterval(this.countdownInterval);
    clearTimeout(this.nextActionTimer);
    this.nextActionTimer = null;
    if (this.dialogObserver) {
      try { this.dialogObserver.disconnect(); } catch {}
      this.dialogObserver = null;
    }
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
