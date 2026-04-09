import { chromium, Browser, Page } from 'playwright';

export interface ScraperOptions {
  headless?: boolean;
}

export class ScraperEngine {
  private browser: Browser | null = null;
  private headless: boolean;

  constructor(options: ScraperOptions = {}) {
    this.headless = options.headless !== undefined ? options.headless : true;
  }

  /**
   * Inicializa el navegador
   */
  public async init() {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: this.headless });
  }

  /**
   * Realiza el escaneo de una URL (abriendo nueva página)
   */
  public async scrape(url: string, onLog: (msg: string) => void) {
    if (!this.browser) await this.init();
    const context = await this.browser!.newContext();
    const page = await context.newPage();

    try {
      onLog(`Navegando a: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      return await this.extract(page, onLog);
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * Extrae datos de una página ya abierta (útil para modo Live)
   */
  public async extract(page: Page, onLog: (msg: string) => void) {
    if (page.isClosed()) throw new Error('La página se cerró antes de iniciar la extracción');
    
    try {
      // Auto-scroll (puede fallar si la navegación cambia muy rápido)
      onLog('Extrayendo snapshot (Auto-scroll habilitado)...');
      await this.autoScroll(page);
      await page.waitForTimeout(1000);

      const titulo = await page.title();
      const rawHtml = await page.content();
      const screenshot = await page.screenshot({ fullPage: true });

      // @ts-ignore
      const ariaSnapshot = await page.ariaSnapshot();
      const elementos = await page.$$eval('button, a, input, select', (nodes) => {
        return nodes.map(node => {
          const el = node as HTMLElement;
          return {
            tag: el.tagName,
            texto: el.innerText || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '',
            role: el.getAttribute('role'),
            id: el.id,
            clases: el.className
          };
        });
      });

      return {
        titulo,
        html: rawHtml,
        screenshot: screenshot.toString('base64'),
        ariaSnapshot,
        elementos
      };
    } catch (e) {
      throw new Error(`Error durante la extracción: ${(e as Error).message}`);
    }
  }

  public async createLiveBrowser() {
    // Obligamos a que el navegador se vea (headless: false)
    const liveBrowser = await chromium.launch({ headless: false });
    const context = await liveBrowser.newContext();
    const page = await context.newPage();
    return { liveBrowser, page };
  }

  /**
   * Cierra el navegador
   */
  public async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
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
