import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';

export interface DownloadOptions {
  onLog?: (msg: string) => void;
}

export class ResourceDownloader {
  private cache: Set<string>;
  private onLog: (msg: string) => void;

  constructor(options: DownloadOptions = {}) {
    this.cache = new Set();
    this.onLog = options.onLog || (() => {});
  }

  /**
   * Descarga un recurso y gestiona la recursividad si es CSS
   */
  public async download(url: string, baseDir: string): Promise<string | null> {
    if (this.cache.has(url)) {
      return this.getSimpleFileName(url);
    }

    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
      });

      const fileName = this.resolveFileName(url, response.headers['content-type']);
      const filePath = path.join(baseDir, fileName);
      
      await fs.mkdir(baseDir, { recursive: true });
      await fs.writeFile(filePath, Buffer.from(response.data));

      this.cache.add(url);

      // Si es CSS, procesamos sus recursos internos
      if (fileName.endsWith('.css')) {
        const cssContent = Buffer.from(response.data).toString('utf8');
        const processedCss = await this.processCssContent(cssContent, url, baseDir);
        await fs.writeFile(filePath, processedCss);
      }

      return fileName;
    } catch (error) {
      this.onLog(`[Aviso] Error descargando asset: ${path.basename(url)}`);
      return null;
    }
  }

  /**
   * Procesa bloques de texto (CSS/Style) buscando url()
   */
  public async processCssContent(content: string, baseUrl: string, baseDir: string): Promise<string> {
    const regex = /url\(['"]?(.+?)['"]?\)/g;
    let match;
    let updatedContent = content;
    const matches = [];

    while ((match = regex.exec(content)) !== null) {
      matches.push({ full: match[0], path: match[1] });
    }

    for (const m of matches) {
      if (m.path.startsWith('data:') || m.path.startsWith('http')) {
         // Si es una URL absoluta o data, decidimos si descargarla (actualmente solo relativas y absolutas del mismo sitio)
      }
      
      try {
        const absoluteUrl = new URL(m.path, baseUrl).toString();
        const fileName = await this.download(absoluteUrl, baseDir);
        if (fileName) {
          updatedContent = updatedContent.split(m.path).join(`./${fileName}`);
        }
      } catch (e) {
        // Path inváldio
      }
    }

    return updatedContent;
  }

  private resolveFileName(url: string, contentType: string = ''): string {
    const urlObj = new URL(url);
    let name = path.basename(urlObj.pathname).split('?')[0];

    if (!name || !name.includes('.')) {
      const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
      name = `asset_${Date.now()}.${ext}`;
    }
    return name;
  }

  private getSimpleFileName(url: string): string {
    return path.basename(new URL(url).pathname).split('?')[0];
  }
}
