const socket = io();

// DOM Elements
const urlInput = document.getElementById('url-input');
const scanBtn = document.getElementById('scan-btn');
const logsContainer = document.getElementById('logs-container');
const resultsGrid = document.getElementById('results-grid');
const refreshBtn = document.getElementById('refresh-btn');

/**
 * Agrega un mensaje a la consola del terminal
 */
function addLog(message, type = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
    entry.innerHTML = `<span style="opacity: 0.5">[${time}]</span> > ${message}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * Carga la biblioteca de clones desde la API
 */
async function loadPages() {
    try {
        const response = await fetch('/api/paginas');
        const paginas = await response.json();

        if (paginas.length === 0) {
            resultsGrid.innerHTML = '<div class="status-message">Aún no has creado ningún clon. ¡Empieza ahora!</div>';
            return;
        }

        resultsGrid.innerHTML = paginas.map(p => {
            // Generar ruta de la captura de pantalla
            const screenshotUrl = p.urlLocal.replace('analisis.html', 'captura.png');
            
            return `
                <div class="result-card">
                    <div class="card-preview" style="background-image: url('${screenshotUrl}')">
                        <div class="card-overlay"></div>
                    </div>
                    <div class="card-info">
                        <div class="card-title" title="${p.nombre}">${p.nombre}</div>
                        <div class="card-domain">${p.dominio}</div>
                        <div class="card-actions">
                            <a href="${p.urlLocal}" target="_blank" class="action-btn btn-open">Ver Clon</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        addLog(`Error al cargar biblioteca: ${error.message}`, 'error');
    }
}

// Iniciar Escaneo
scanBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return addLog('Ingresa una URL válida primero', 'error');

    logsContainer.innerHTML = '';
    addLog(`Iniciando secuencia de análisis sobre: ${url}`, 'system');
    
    scanBtn.disabled = true;
    scanBtn.textContent = 'Analizando...';
    
    socket.emit('iniciar-analisis', url);
});

// Logs en tiempo real
socket.on('log', (msg) => {
    addLog(msg);
});

// Finalizado
socket.on('finalizado', (data) => {
    addLog(`¡Éxito! Clon de ${data.dominio} completado correctamente.`, 'success');
    scanBtn.disabled = false;
    scanBtn.textContent = 'Escaneo Rápido';
    loadPages();
});

// Errores
socket.on('error', (err) => {
    addLog(`ERROR CRÍTICO: ${err}`, 'error');
    scanBtn.disabled = false;
    scanBtn.textContent = 'Escaneo Rápido';
});

// Refrescar manual
refreshBtn.addEventListener('click', loadPages);

// Carga inicial
loadPages();

// Estilo visual extra al escribir
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !scanBtn.disabled) {
        scanBtn.click();
    }
});
