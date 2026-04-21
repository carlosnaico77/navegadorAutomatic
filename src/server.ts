import express from 'express';
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { chromium, BrowserContext, Page } from 'playwright';
import { AnalysisOrchestrator } from './core/AnalysisOrchestrator.js';
import { NetworkRecorder } from './core/NetworkRecorder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = 3000;
const ROOT = process.cwd();
const OUTPUTS_DIR = path.join(ROOT, 'outputs');
const AUTH_PATH = path.join(ROOT, 'src', 'auth');
const orchestrator = new AnalysisOrchestrator();

app.use(express.json());
app.use(express.static(path.join(ROOT, 'src', 'public')));
app.use('/outputs', express.static(OUTPUTS_DIR));
app.get('/dashboard', (req, res) => res.redirect('/'));

// ── Estado global ─────────────────────────────────────────────────────────────

let browserSession: { context: BrowserContext; page: Page; socket: Socket } | null = null;

let activeRecording: {
  recorder: NetworkRecorder;
  htmlInterval: ReturnType<typeof setInterval>;
  screenshotInterval: ReturnType<typeof setInterval>;
  startTime: number;
  snapshotCount: number;
  sectionName: string;
  sectionSlug: string;
  domain: string;
  outputDir: string;
  socket: Socket;
} | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function obtenerPaginasScrapeadas(dir: string): Promise<any[]> {
  const paginas: any[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        paginas.push(...await obtenerPaginasScrapeadas(fullPath));
      } else if (entry.name === 'analisis.html' || entry.name === 'snapshot.html') {
        const relativePath = path.relative(OUTPUTS_DIR, fullPath).replace(/\\/g, '/');
        const parts = relativePath.split('/');
        const tipo = entry.name === 'snapshot.html' ? 'grabacion' : 'escaneo';
        const screenshotFullPath = path.join(path.dirname(fullPath), 'captura.png');
        let screenshotUrl: string | null = null;
        try { await fs.access(screenshotFullPath); screenshotUrl = `/outputs/${relativePath.replace(/[^/]+$/, 'captura.png')}`; } catch { /* no existe */ }
        paginas.push({
          dominio: parts[0],
          nombre: parts.slice(1, -1).join('/') || 'Raíz',
          urlLocal: `/outputs/${relativePath}`,
          screenshotUrl,
          tipo,
          fecha: (await fs.stat(fullPath)).mtime,
        });
      }
    }
  } catch { /* vacío */ }
  return paginas;
}

app.get('/api/paginas', async (req, res) => {
  const paginas = await obtenerPaginasScrapeadas(OUTPUTS_DIR);
  paginas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  res.json(paginas);
});

// ── Función: iniciar grabación (reutilizable) ─────────────────────────────────

async function iniciarGrabacion(socket: Socket, sectionName: string) {
  if (!browserSession) return;
  const { page } = browserSession;

  let domain = 'unknown';
  try { domain = new URL(page.url()).hostname; } catch { /* usar unknown */ }

  const sectionSlug = sectionName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  const outputDir = path.join(OUTPUTS_DIR, domain, sectionSlug);
  await fs.mkdir(outputDir, { recursive: true });

  const recorder = new NetworkRecorder(outputDir);
  const log = (msg: string) => socket.emit('grabacion-log', msg);

  // 1. Descargar assets que ya están en el DOM (llegaron antes de iniciar grabación)
  await recorder.downloadCurrentAssets(page, log);

  // 2. Interceptar nuevas peticiones de red desde este momento
  recorder.attachWithLogger(page, log);

  const startTime = Date.now();
  let snapshotCount = 0;

  const saveSnapshot = async () => {
    try {
      if (page.isClosed()) return;
      const rawHtml = await page.content();
      const rewrittenHtml = recorder.rewriteHtml(rawHtml, page.url());
      await fs.writeFile(path.join(outputDir, 'snapshot.html'), rewrittenHtml, 'utf-8');
      snapshotCount++;
      log(`💾 Snapshot #${snapshotCount} guardado`);
      if (activeRecording) activeRecording.snapshotCount = snapshotCount;
    } catch { /* silencioso */ }
  };

  const saveScreenshot = async () => {
    try {
      if (page.isClosed()) return;
      const screenshot = await page.screenshot({ fullPage: false });
      await fs.writeFile(path.join(outputDir, 'captura.png'), screenshot);
    } catch { /* silencioso */ }
  };

  const htmlInterval = setInterval(saveSnapshot, 4000);
  const screenshotInterval = setInterval(saveScreenshot, 8000);

  page.on('load', saveSnapshot);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) saveSnapshot();
  });

  activeRecording = {
    recorder, htmlInterval, screenshotInterval,
    startTime, snapshotCount: 0, sectionName, sectionSlug, domain, outputDir, socket,
  };

  await saveSnapshot();
  await saveScreenshot();

  socket.emit('grabacion-iniciada', { sectionName, domain, sectionSlug });
  log(`🔴 GRABANDO: ${sectionName} (${domain})`);
}

// ── Función: detener grabación ────────────────────────────────────────────────

async function detenerGrabacion(socket: Socket, browserAlsoClosed: boolean) {
  if (!activeRecording) return;
  const { recorder, htmlInterval, screenshotInterval, startTime, sectionName, sectionSlug, domain, outputDir } = activeRecording;
  clearInterval(htmlInterval);
  clearInterval(screenshotInterval);

  if (!browserAlsoClosed && browserSession && !browserSession.page.isClosed()) {
    try {
      socket.emit('grabacion-log', '📥 Procesando HTML final, JSDOM y recursos rezagados...');
      const rawHtml = await browserSession.page.content();
      const rewrittenHtml = await recorder.processFinalHtml(rawHtml, browserSession.page, (msg) => socket.emit('grabacion-log', msg));
      await fs.writeFile(path.join(outputDir, 'snapshot.html'), rewrittenHtml, 'utf-8');
      socket.emit('grabacion-log', '💾 Snapshot final guardado (URLs locales)');
      const screenshot = await browserSession.page.screenshot({ fullPage: false });
      await fs.writeFile(path.join(outputDir, 'captura.png'), screenshot);
      socket.emit('grabacion-log', '📸 Captura final guardada');
    } catch { /* silencioso */ }
  }

  try {
    await recorder.saveSessionReport({
      url: `https://${domain}`,
      sectionName,
      startedAt: new Date(startTime).toISOString(),
      duration_ms: Date.now() - startTime,
    });
    socket.emit('grabacion-log', '📊 session-report.json guardado');
  } catch { /* continuar */ }

  const duration = Math.round((Date.now() - startTime) / 1000);
  activeRecording = null;

  socket.emit('grabacion-completada', {
    apiCalls: recorder.getCallCount(),
    assets: recorder.getAssetCount(),
    duration,
    sectionName,
    domain,
    sectionSlug,
  });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Cliente Dashboard conectado');

  socket.emit('browser-state', {
    open: !!browserSession,
    recording: !!activeRecording,
    section: activeRecording?.sectionName ?? null,
  });

  // ── ESCANEO RÁPIDO ────────────────────────────────────────────────────────
  socket.on('iniciar-analisis', async (url) => {
    try {
      const result = await orchestrator.execute(url, (msg) => socket.emit('log', msg));
      socket.emit('finalizado', {
        dominio: result.pathInfo.domain,
        nombre: result.pathInfo.subPath,
        urlLocal: result.urlLocal,
      });
    } catch (error) {
      socket.emit('error', (error as Error).message);
    }
  });

  // ── ABRIR NAVEGADOR ───────────────────────────────────────────────────────
  socket.on('abrir-navegador', async ({ url, recordOnOpen, sectionName }) => {
    if (browserSession) {
      socket.emit('grabacion-error', 'Ya hay un navegador abierto.');
      return;
    }

    socket.emit('grabacion-log', '🚀 Abriendo navegador con sesión persistente...');

    try {
      const context = await chromium.launchPersistentContext(AUTH_PATH, {
        headless: false,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        viewport: { width: 1440, height: 900 },
      });

      const page = await context.newPage();
      browserSession = { context, page, socket };

      context.on('close', async () => {
        socket.emit('grabacion-log', '🔴 Navegador cerrado.');
        if (activeRecording) await detenerGrabacion(socket, true);
        browserSession = null;
        socket.emit('browser-cerrado');
      });

      socket.emit('browser-abierto');
      socket.emit('grabacion-log', '✅ Navegador listo.');

      // Si marcó "Grabar desde el inicio", iniciamos la intercepción ANTES de navegar
      if (recordOnOpen && sectionName) {
        socket.emit('grabacion-log', `🔴 Iniciando grabación automática: "${sectionName}"`);
        await iniciarGrabacion(socket, sectionName);
      }

      socket.emit('grabacion-log', `🌐 Navegando a: ${url}`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch { /* continuar */ }

    } catch (err) {
      browserSession = null;
      socket.emit('grabacion-error', `No se pudo abrir: ${(err as Error).message}`);
    }
  });

  // ── CERRAR NAVEGADOR ──────────────────────────────────────────────────────
  socket.on('cerrar-navegador', async () => {
    // Si cierran el navegador desde el panel, PRIMERO forzamos el escaneo final y descargas (con false) ya que el browser sigue vivo.
    if (activeRecording) await detenerGrabacion(socket, false);
    
    if (browserSession) {
      try { await browserSession.context.close(); } catch { /* ya cerrado */ }
      browserSession = null;
    }
    socket.emit('browser-cerrado');
    socket.emit('grabacion-log', '🔒 Navegador cerrado.');
  });

  // ── INICIAR GRABACIÓN ─────────────────────────────────────────────────────
  socket.on('iniciar-grabacion', async ({ sectionName }) => {
    if (!browserSession) {
      socket.emit('grabacion-error', 'Primero abre el navegador.');
      return;
    }
    if (activeRecording) {
      socket.emit('grabacion-error', 'Ya hay una grabación activa. Detén la actual primero.');
      return;
    }
    await iniciarGrabacion(socket, sectionName);
  });

  // ── DETENER GRABACIÓN ─────────────────────────────────────────────────────
  socket.on('detener-grabacion', async () => {
    await detenerGrabacion(socket, false);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Dashboard iniciado en http://localhost:${PORT}`);
});
