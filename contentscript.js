// contentScript.js

let rodando = false;
let perfisSeguidos = 0;
let limite = 10;
let overlay = null;
let countdownInterval = null;

// Cria overlay
function criarOverlay() {
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "autoFollowOverlay";
        overlay.style.position = "fixed";
        overlay.style.bottom = "20px";
        overlay.style.right = "20px";
        overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
        overlay.style.color = "white";
        overlay.style.padding = "10px";
        overlay.style.borderRadius = "5px";
        overlay.style.zIndex = "9999";
        overlay.style.fontFamily = "Arial, sans-serif";
        overlay.style.fontSize = "14px";
        overlay.innerText = "Aguardando início...";
        document.body.appendChild(overlay);
    }
}

function atualizarOverlay(texto) {
    if (overlay) overlay.innerText = texto;
}

// Delay aleatório entre 120 e 180 segundos
function getRandomDelay() {
    return 120000 + Math.random() * 60000; 
}

// Countdown em tempo real
function startCountdown(seconds) {
    clearInterval(countdownInterval);
    let remaining = seconds;

    countdownInterval = setInterval(() => {
        if (!rodando) {
            clearInterval(countdownInterval);
            return;
        }

        atualizarOverlay(`Aguardando ${remaining}s... (${perfisSeguidos}/${limite})`);

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            seguirProximoUsuario();
        }

        remaining--;
    }, 1000);
}

// Função para encontrar a div scrollável dentro do modal
function encontrarModalInterno(modal) {
    const divs = modal.querySelectorAll('div');
    for (let div of divs) {
        if (div.scrollHeight > div.clientHeight) {
            return div;
        }
    }
    return null;
}

// Função principal para seguir perfis
function seguirProximoUsuario() {
    if (!rodando) return;

    const modal = document.querySelector('div[role="dialog"]');
    if (!modal) {
        atualizarOverlay("Abra o modal de seguidores!");
        setTimeout(seguirProximoUsuario, 1000);
        return;
    }

    const modalInterno = encontrarModalInterno(modal);
    if (!modalInterno) {
        atualizarOverlay("Não encontrou a div interna scrollável!");
        setTimeout(seguirProximoUsuario, 1000);
        return;
    }

    // Pega o primeiro botão "Seguir" visível
    const btn = Array.from(modalInterno.querySelectorAll('button'))
        .find(b => b.innerText.toLowerCase() === 'seguir' || b.innerText.toLowerCase() === 'follow');

    if (btn) {
        btn.click();
        perfisSeguidos++;
        atualizarOverlay(`Seguindo... (${perfisSeguidos}/${limite})`);

        // Scroll fixo menor para não pular perfis
        modalInterno.scrollTop += 70;
    } else {
        // Scroll para tentar carregar mais perfis
        const prevScroll = modalInterno.scrollTop;
        modalInterno.scrollTop += 50;

        setTimeout(() => {
            if (modalInterno.scrollTop === prevScroll) {
                atualizarOverlay(`Fim do modal ou todos os perfis carregados (${perfisSeguidos}/${limite})`);
                rodando = false;
                clearInterval(countdownInterval);
                return;
            }
            seguirProximoUsuario();
        }, 1500);
        return;
    }

    if (perfisSeguidos >= limite) {
        rodando = false;
        atualizarOverlay(`Limite atingido (${limite})`);
        clearInterval(countdownInterval);
        return;
    }

    const delaySegundos = Math.floor(getRandomDelay() / 1000);
    startCountdown(delaySegundos);
}

// Iniciar automação
function iniciar(limiteParam) {
    if (rodando) return;
    rodando = true;
    perfisSeguidos = 0;
    limite = Math.min(limiteParam || 10, 200); // garante até 200
    criarOverlay();
    seguirProximoUsuario();
}

// Parar automação
function parar() {
    rodando = false;
    atualizarOverlay("Automação parada");
    clearInterval(countdownInterval);
}

// Recebe mensagens do popup
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'start') iniciar(msg.limite);
    if (msg.action === 'stop') parar();
});
