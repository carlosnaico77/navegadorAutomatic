import { chromium, BrowserContext } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import readline from 'node:readline';
import { NetworkRecorder } from './core/NetworkRecorder.js';

const ROOT = process.cwd();
const AUTH_PATH = path.join(ROOT, 'src', 'auth');
const OUTPUTS_PATH = path.join(ROOT, 'outputs');

async function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       SCRAPER — MODO GRABACIÓN       ║');
  console.log('╚══════════════════════════════════════╝\n');

  const sectionName = await askQuestion('📌 ¿Cómo se llamará esta sección? (ej: ventas, login): ');
  if (!sectionName) { console.error('❌ El nombre no puede estar vacío.'); process.exit(1); }

  const startUrl = await askQuestion('🌐 URL de inicio (ej: https://www.fibextelecom.net): ');
  if (!startUrl) { console.error('❌ La URL no puede estar vacía.'); process.exit(1); }

  let domain: string;
  try {
    domain = new URL(startUrl).hostname;
  } catch {
    console.error('❌ La URL no es válida.'); process.exit(1);
  }

  const sectionSlug = sectionName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  const outputDir = path.join(OUTPUTS_PATH, domain!, sectionSlug);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`\n📁 Carpeta de salida: outputs/${domain}/${sectionSlug}/`);
  console.log('🚀 Abriendo navegador persistente...\n');

  const context: BrowserContext = await chromium.launchPersistentContext(AUTH_PATH, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const recorder = new NetworkRecorder(outputDir);
  recorder.attach(page);

  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  let snapshotCount = 0;
  let shutdownCalled = false; // Evitar doble llamada

  // --- GUARDADO CONTINUO DE HTML ---
  const saveHtmlSnapshot = async (reason: string) => {
    try {
      if (page.isClosed()) return;
      const html = await page.content();
      const filePath = path.join(outputDir, 'snapshot.html');
      await fs.writeFile(filePath, html, 'utf-8');
      snapshotCount++;
      console.log(`  [💾 HTML] Snapshot #${snapshotCount} guardado (${reason})`);
    } catch {
      // Silencioso: puede ocurrir durante transiciones de navegación
    }
  };

  // Guardar cada 4 segundos automáticamente
  const htmlInterval = setInterval(() => saveHtmlSnapshot('auto-4s'), 4000);

  // Guardar en cada evento de carga o navegación
  page.on('load', () => saveHtmlSnapshot('page load'));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) saveHtmlSnapshot('frame nav');
  });

  // Navegar a la URL inicial
  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    console.warn('⚠️  La página tardó en cargar, continuando...');
  }

  console.log('✅ Navegador abierto. Navega libremente.');
  console.log('⏹  Presiona Ctrl+C para DETENER la grabación.\n');

  // --- FUNCIÓN DE CIERRE LIMPIO ---
  const shutdown = async () => {
    if (shutdownCalled) return;
    shutdownCalled = true;

    clearInterval(htmlInterval);

    console.log('  📊 Guardando reporte de sesión...');
    try {
      await recorder.saveSessionReport({
        url: startUrl,
        sectionName,
        startedAt,
        duration_ms: Date.now() - startTime,
      });
    } catch (e) {
      console.error('  ❌ Error guardando reporte:', e);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║        ✅ GRABACIÓN COMPLETADA           ║`);
    console.log(`╠══════════════════════════════════════════╣`);
    console.log(`║  Sección      : ${sectionName.padEnd(24)}║`);
    console.log(`║  HTML snaps   : ${String(snapshotCount).padEnd(24)}║`);
    console.log(`║  API calls    : ${String(recorder.getCallCount()).padEnd(24)}║`);
    console.log(`║  Assets       : ${String(recorder.getAssetCount()).padEnd(24)}║`);
    console.log(`║  Duración     : ${String(duration + 's').padEnd(24)}║`);
    console.log(`║  Carpeta      : outputs/${domain}/${sectionSlug}/`);
    console.log(`╚══════════════════════════════════════════╝\n`);

    try { await context.close(); } catch { /* ya cerrado */ }
    process.exit(0);
  };

  // Detectar cuando el usuario cierra Chrome manualmente
  context.on('close', () => shutdown());

  // Detectar Ctrl+C — intentar hacer un último snapshot antes de cerrar
  process.on('SIGINT', async () => {
    console.log('\n\n⏸  Ctrl+C recibido. Cerrando...');
    await saveHtmlSnapshot('snapshot final');
    await shutdown();
  });

  // Mantener el proceso vivo
  await new Promise(() => {});
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
