import { chromium, BrowserContext, Page } from 'playwright';
import path from 'node:path';

export interface ScraperOptions {
  headless?: boolean;
}

export class ScraperEngine {
  private context: BrowserContext | null = null;
  private headless: boolean;
  private authPath: string;

  constructor(options: ScraperOptions = {}) {
    this.headless = options.headless !== undefined ? options.headless : true;
    this.authPath = path.join(process.cwd(), 'src', 'auth');
  }

  /**
   * Inicializa el contexto persistente
   */
  public async init() {
    if (this.context) return;
    
    // Configuración solicitada para persistencia y evasión
    this.context = await chromium.launchPersistentContext(this.authPath, {
      headless: this.headless,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      viewport: { width: 1280, height: 720 }
    });
  }

  /**
   * Realiza el escaneo de una URL (usando el contexto persistente)
   */
  public async scrape(url: string, onLog: (msg: string) => void) {
    if (!this.context) await this.init();
    const page = await this.context!.newPage();

    try {
      onLog(`Navegando a: ${url} (Modo Persistente)`);
      // Aumentamos el timeout para sitios con login pesado
      await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
      return await this.extract(page, onLog);
    } finally {
      await page.close();
    }
  }

  /**
   * Extrae datos de una página ya abierta
   */
  public async extract(page: Page, onLog: (msg: string) => void) {
    if (page.isClosed()) throw new Error('La página se cerró antes de iniciar la extracción');
    
    try {
      onLog('Extrayendo snapshot (Auto-scroll habilitado)...');
      await this.autoScroll(page);
      await page.waitForTimeout(1000);

      const titulo = await page.title();
      const rawHtml = await page.content();
      const screenshot = await page.screenshot({ fullPage: true });

      return {
        titulo,
        html: rawHtml,
        screenshot: screenshot.toString('base64')
      };
    } catch (e) {
      throw new Error(`Error durante la extracción: ${(e as Error).message}`);
    }
  }

  /**
   * Cierra el contexto (y el navegador asociado)
   */
  public async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  private async autoScroll(page: Page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve(true);
          }
        }, 100);
      });
    });
  }
}
