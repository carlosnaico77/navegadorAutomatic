import { ScraperEngine } from '../analyzer.js';
import { ResourceDownloader } from '../downloader.js';
import { StorageManager } from './StorageManager.js';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { Page } from 'playwright';

export class AnalysisOrchestrator {
  private scraper: ScraperEngine;
  private storage: StorageManager;

  constructor() {
    this.scraper = new ScraperEngine();
    this.storage = new StorageManager();
  }

  /**
   * Ejecuta el proceso completo de análisis desde una URL (Abre nueva página)
   */
  public async execute(url: string, onLog: (msg: string) => void) {
    try {
      const rawData = await this.scraper.scrape(url, onLog);
      return await this.processSnapshot(url, rawData, onLog);
    } finally {
      await this.scraper.close();
    }
  }

  /**
   * Lógica común para procesar el DOM, descargar assets y guardar en disco
   */
  private async processSnapshot(url: string, rawData: any, onLog: (msg: string) => void) {
    const pathInfo = this.storage.resolvePath(url);
    onLog(`Sincronizando archivos en: ${pathInfo.subPath}`);
    await this.storage.ensureDir(pathInfo.fullPath);

    onLog('Iniciando clonación profunda de recursos...');
    const dom = new JSDOM(rawData.html);
    const document = dom.window.document;
    const assetsDir = path.join(pathInfo.fullPath, 'assets');
    
    const downloader = new ResourceDownloader({ onLog });

    // Limpiar scripts
    const scripts = Array.from(document.querySelectorAll('script'));
    scripts.forEach(s => s.remove());

    const resources = [
      { sel: 'img', attr: 'src' },
      { sel: 'link[rel="stylesheet"]', attr: 'href' }
    ];

    for (const { sel, attr } of resources) {
      const elements = Array.from(document.querySelectorAll(sel));
      for (const el of elements) {
        const originalUrl = el.getAttribute(attr);
        if (originalUrl && !originalUrl.startsWith('data:')) {
          const absoluteUrl = new URL(originalUrl, url).toString();
          const fileName = await downloader.download(absoluteUrl, assetsDir);
          if (fileName) {
            el.setAttribute(attr, `./assets/${fileName}`);
          }
        }
      }
    }

    const styles = Array.from(document.querySelectorAll('style'));
    for (const style of styles) {
      if (style.textContent) {
        style.textContent = await downloader.processCssContent(style.textContent, url, assetsDir);
      }
    }

    const htmlFinal = dom.serialize();

    onLog('Guardando archivos finales...');
    await this.storage.saveHtml(pathInfo.fullPath, htmlFinal);
    await this.storage.saveScreenshot(pathInfo.fullPath, rawData.screenshot);

    return {
      pathInfo,
      urlLocal: this.storage.getRelativeUrl(pathInfo.fullPath),
      titulo: rawData.titulo
    };
  }
}
