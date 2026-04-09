const socket = io();

const urlInput = document.getElementById('url-input');
const scanBtn = document.getElementById('scan-btn');
const logsContainer = document.getElementById('logs');
const pagesGrid = document.getElementById('pages-grid');
const resultsCount = document.getElementById('results-count');

/**
 * Agrega un mensaje a la terminal
 */
function addLog(msg, type = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `> ${msg}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * Carga la lista de páginas analizadas desde la API
 */
async function loadPages() {
    try {
        const res = await fetch('/api/paginas');
        const paginas = await res.json();
        
        resultsCount.textContent = `${paginas.length} resultados`;
        pagesGrid.innerHTML = '';

        paginas.forEach(p => {
            const card = document.createElement('div');
            card.className = 'page-card';
            
            const dateStr = new Date(p.fecha).toLocaleString();
            
            card.innerHTML = `
                <div class="page-info">
                    <div class="page-domain">${p.dominio}</div>
                    <h3>${p.nombre}</h3>
                    <div class="page-meta">Escaneado: ${dateStr}</div>
                </div>
                <div class="page-actions">
                    <a href="${p.urlLocal}" target="_blank" class="btn-view">Ver Clon</a>
                </div>
            `;
            pagesGrid.appendChild(card);
        });
    } catch (e) {
        console.error('Error cargando páginas:', e);
    }
}

// Iniciar escaneo
scanBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return alert('Ingresa una URL válida');

    logsContainer.innerHTML = '';
    addLog(`Solicitando análisis de ${url}...`, 'system');
    socket.emit('iniciar-analisis', url);
    scanBtn.disabled = true;
    scanBtn.textContent = 'Escaneando...';
});

// Logs en vivo
socket.on('log', (msg) => {
    addLog(msg);
});

// Finalizado
socket.on('finalizado', (data) => {
    addLog(`¡Análisis completado con éxito!`, 'system');
    scanBtn.disabled = false;
    scanBtn.textContent = 'Escaneo Rápido';
    loadPages();
});

// Errores
socket.on('error', (msg) => {
    addLog(`ERROR: ${msg}`, 'error');
    scanBtn.disabled = false;
    scanBtn.textContent = 'Escaneo Rápido';
});

// Cargar páginas al inicio
loadPages();
setInterval(loadPages, 5000); // Actualización automática suave cada 5s
