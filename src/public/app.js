const socket = io();

// ── DOM Elements ──────────────────────────────────────────────────────────────
const urlInput          = document.getElementById('url-input');
const scanBtn           = document.getElementById('scan-btn');
const logsContainer     = document.getElementById('logs-container');
const resultsGrid       = document.getElementById('results-grid');
const refreshBtn        = document.getElementById('refresh-btn');

// Fase 1 — Navegador
const browserUrlInput   = document.getElementById('browser-url');
const openBrowserBtn    = document.getElementById('open-browser-btn');
const closeBrowserBtn   = document.getElementById('close-browser-btn');
const recordOnOpenCheck = document.getElementById('record-on-open');   // checkbox
const sectionNamePhase1 = document.getElementById('record-section-name'); // en Fase 1

// Fase 2 — Grabación adicional
const recordSectionName = document.getElementById('record-section-name-2');
const recordStartBtn    = document.getElementById('record-start-btn');
const recordStopBtn     = document.getElementById('record-stop-btn');

// Estado visual
const recordSection     = document.getElementById('record-section');
const recordIcon        = document.getElementById('record-icon');
const recordStatusBadge = document.getElementById('record-status-badge');
const recordStats       = document.getElementById('record-stats');
const recordTerminal    = document.getElementById('record-terminal');
const recordLogs        = document.getElementById('record-logs');
const statApis          = document.getElementById('stat-apis');
const statAssets        = document.getElementById('stat-assets');
const statSnaps         = document.getElementById('stat-snaps');
const statTime          = document.getElementById('stat-time');

// ── Estado local ──────────────────────────────────────────────────────────────
let browserOpen     = false;
let recordingActive = false;
let recordStartTime = null;
let recordTimer     = null;
let apiCount = 0, assetCount = 0, snapCount = 0;

// ── Logs ──────────────────────────────────────────────────────────────────────
function addLog(message, type = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
    entry.innerHTML = `<span style="opacity:0.5">[${time}]</span> > ${message}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

function addRecordLog(message) {
    const entry = document.createElement('div');
    entry.className = 'record-log-entry';
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
    entry.textContent = `[${time}] ${message}`;
    recordLogs.appendChild(entry);
    recordLogs.scrollTop = recordLogs.scrollHeight;

    // Actualizar contadores desde el contenido del log
    if (message.includes('API ') || message.includes('🟢') || message.includes('🔴')) apiCount++;
    if (message.includes('STYLESHEET') || message.includes('SCRIPT') ||
        message.includes('IMAGE') || message.includes('FONT')) assetCount++;
    if (message.includes('Snapshot') || message.includes('snapshot')) snapCount++;
    if (recordingActive) updateStats();
}

function updateStats() {
    statApis.textContent   = `🔵 APIs: ${apiCount}`;
    statAssets.textContent = `📦 Assets: ${assetCount}`;
    statSnaps.textContent  = `💾 Snaps: ${snapCount}`;
    if (recordStartTime) {
        const s = Math.round((Date.now() - recordStartTime) / 1000);
        statTime.textContent = `⏱ ${s}s`;
    }
}

// ── Estado de navegador — habilitar/deshabilitar controles ────────────────────
function setNavegadorAbierto(open) {
    browserOpen = open;
    openBrowserBtn.disabled = open;
    closeBrowserBtn.disabled = !open;
    recordSectionName.disabled = !open;
    recordStartBtn.disabled = !open || recordingActive;

    if (open) {
        recordStatusBadge.textContent = '🟢 Navegador activo';
        recordStatusBadge.className = 'record-badge browser-open';
        recordSection.classList.add('browser-open');
        recordSection.classList.remove('recording');
    } else {
        recordStatusBadge.textContent = 'Sin navegador';
        recordStatusBadge.className = 'record-badge';
        recordSection.classList.remove('browser-open', 'recording');
    }
}

function setGrabando(active) {
    recordingActive = active;
    recordStartBtn.disabled = active;
    recordStopBtn.disabled = !active;
    openBrowserBtn.disabled = true;   // No abrir otro mientras graba
    closeBrowserBtn.disabled = active; // No cerrar mientras graba

    if (active) {
        recordSection.classList.add('recording');
        recordIcon.style.animation = 'blink 1s step-start infinite';
        recordStatusBadge.textContent = '🔴 Grabando...';
        recordStatusBadge.className = 'record-badge active';
        recordStats.style.display = 'flex';
        recordTerminal.style.display = 'block';
    } else {
        recordSection.classList.remove('recording');
        recordIcon.style.animation = 'none';
        openBrowserBtn.disabled = !browserOpen ? false : true;
        closeBrowserBtn.disabled = !browserOpen;
        if (browserOpen) setNavegadorAbierto(true);
    }
}

// ── Cargar páginas ────────────────────────────────────────────────────────────
async function loadPages() {
    try {
        const response = await fetch('/api/paginas');
        const paginas = await response.json();

        if (paginas.length === 0) {
            resultsGrid.innerHTML = '<div class="status-message">Aún no has creado ningún clon. ¡Empieza ahora!</div>';
            return;
        }

        resultsGrid.innerHTML = paginas.map(p => {
            const badge = p.tipo === 'grabacion'
                ? `<span class="card-type-badge grabacion">⬤ Grabación</span>`
                : `<span class="card-type-badge escaneo">⚡ Escaneo</span>`;

            const previewStyle = p.screenshotUrl
                ? `background-image: url('${p.screenshotUrl}')`
                : `background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))`;

            return `
                <div class="result-card">
                    <div class="card-preview" style="${previewStyle}">
                        <div class="card-overlay"></div>
                        ${badge}
                    </div>
                    <div class="card-info">
                        <div class="card-title" title="${p.nombre}">${p.nombre}</div>
                        <div class="card-domain">${p.dominio}</div>
                        <div class="card-actions">
                            <a href="${p.urlLocal}" target="_blank" class="action-btn btn-open">Ver</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        addLog(`Error al cargar biblioteca: ${error.message}`, 'error');
    }
}

// ── ESCANEO RÁPIDO ────────────────────────────────────────────────────────────
scanBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return addLog('Ingresa una URL válida primero', 'error');
    logsContainer.innerHTML = '';
    addLog(`Iniciando análisis: ${url}`, 'system');
    scanBtn.disabled = true;
    scanBtn.textContent = 'Analizando...';
    socket.emit('iniciar-analisis', url);
});

socket.on('log', (msg) => addLog(msg));
socket.on('finalizado', (data) => {
    addLog(`✅ Clon de ${data.dominio}/${data.nombre} completado.`, 'success');
    scanBtn.disabled = false;
    scanBtn.textContent = 'Escaneo Rápido';
    loadPages();
});
socket.on('error', (err) => {
    addLog(`ERROR: ${err}`, 'error');
    scanBtn.disabled = false;
    scanBtn.textContent = 'Escaneo Rápido';
});

// ── FASE 1: ABRIR / CERRAR NAVEGADOR ─────────────────────────────────────────
openBrowserBtn.addEventListener('click', () => {
    const url = browserUrlInput.value.trim();
    if (!url) return addLog('Ingresa una URL de inicio', 'error');

    const recordOnOpen = recordOnOpenCheck.checked;
    const sectionName  = sectionNamePhase1.value.trim();

    if (recordOnOpen && !sectionName) {
        return addLog('Con "Grabar desde el inicio" necesitas escribir el nombre de la sección', 'error');
    }

    openBrowserBtn.disabled = true;
    openBrowserBtn.textContent = 'Abriendo...';
    socket.emit('abrir-navegador', { url, recordOnOpen, sectionName });
    addLog(`🌐 Abriendo Chrome en: ${url}${recordOnOpen ? ` · grabando "${sectionName}"` : ''}`, 'system');
});

closeBrowserBtn.addEventListener('click', () => {
    if (!confirm('¿Cerrar el navegador? Se detendrá cualquier grabación activa.')) return;
    socket.emit('cerrar-navegador');
});

socket.on('browser-abierto', () => {
    openBrowserBtn.textContent = '🌐 Abrir Navegador';
    setNavegadorAbierto(true);
    addLog('✅ Navegador abierto. Navega y graba cuando quieras.', 'success');
    addRecordLog('✅ Navegador listo.');
    recordTerminal.style.display = 'block';
});

socket.on('browser-cerrado', () => {
    setNavegadorAbierto(false);
    setGrabando(false);
    openBrowserBtn.textContent = '🌐 Abrir Navegador';
    addLog('🔒 Navegador cerrado.', 'system');
});

// ── FASE 2: INICIAR / DETENER GRABACIÓN ───────────────────────────────────────
recordStartBtn.addEventListener('click', () => {
    const sectionName = recordSectionName.value.trim();
    if (!sectionName) return addLog('Escribe el nombre de la sección antes de grabar', 'error');

    apiCount = 0; assetCount = 0; snapCount = 0;
    recordLogs.innerHTML = '';
    recordStartTime = Date.now();
    recordTimer = setInterval(updateStats, 1000);

    setGrabando(true);
    socket.emit('iniciar-grabacion', { sectionName });
    addLog(`🔴 Grabando sección: ${sectionName}`, 'system');
});

recordStopBtn.addEventListener('click', () => {
    socket.emit('detener-grabacion');
});

socket.on('grabacion-iniciada', ({ sectionName, domain }) => {
    // Si la grabación se inició desde el backend (ej. Grabar desde el inicio),
    // debemos asegurarnos de que la UI entre en estado de grabación
    if (!recordingActive) {
        apiCount = 0; assetCount = 0; snapCount = 0;
        recordLogs.innerHTML = '';
        recordStartTime = Date.now();
        recordTimer = setInterval(updateStats, 1000);
        setGrabando(true);
    }
    
    addRecordLog(`🔴 GRABANDO: "${sectionName}" en ${domain}`);
});

socket.on('grabacion-log', (msg) => addRecordLog(msg));

socket.on('grabacion-completada', (data) => {
    clearInterval(recordTimer);
    setGrabando(false);
    recordStatusBadge.textContent = `✅ "${data.sectionName}" guardado`;
    recordStatusBadge.className = 'record-badge done';

    addLog(`✅ Sección "${data.sectionName}" — ${data.apiCalls} APIs, ${data.assets} assets, ${data.duration}s`, 'success');
    addRecordLog('');
    addRecordLog(`✅ COMPLETADO: ${data.sectionName}`);
    addRecordLog(`   🔵 APIs: ${data.apiCalls}  |  📦 Assets: ${data.assets}  |  ⏱ ${data.duration}s`);
    addRecordLog(`   📁 outputs/${data.domain}/${data.sectionSlug}/`);

    // Limpiar nombre para permitir grabar otra sección
    recordSectionName.value = '';
    loadPages();
});

socket.on('grabacion-error', (err) => {
    clearInterval(recordTimer);
    setGrabando(false);
    addLog(`❌ Error: ${err}`, 'error');
    addRecordLog(`❌ ${err}`);
});

// Sincronizar estado al reconectar / recargar
socket.on('browser-state', ({ open, recording, section }) => {
    if (open) setNavegadorAbierto(true);
    if (recording) {
        setGrabando(true);
        if (section) recordSectionName.value = section;
    }
});

// ── Utilitarios ───────────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', loadPages);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !scanBtn.disabled) scanBtn.click();
});
loadPages();
