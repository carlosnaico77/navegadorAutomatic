import fs from 'node:fs/promises';
import path from 'node:path';
import { Page, Request, Response } from 'playwright';
import { JSDOM } from 'jsdom';


interface ApiCall {
  index: number;
  timestamp: string;
  method: string;
  url: string;
  resourceType: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  duration_ms: number;
}

const ASSET_TYPES: Record<string, string> = {
  stylesheet: 'styles',
  script: 'scripts',
  image: 'images',
  font: 'fonts',
  media: 'media',
};

const API_TYPES = ['xhr', 'fetch'];

export class NetworkRecorder {
  private apiCalls: ApiCall[] = [];
  private requestTimestamps = new Map<string, { time: number; req: Request }>();
  private savedAssets = new Set<string>();
  // Mapa: URL original → ruta local relativa (para reescribir el HTML)
  private urlToLocalPath = new Map<string, string>();
  private outputDir: string;
  private apiIndex = 1;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /** Adjunta listeners con console.log */
  public attach(page: Page) {
    this.attachWithLogger(page, (msg) => console.log(msg));
  }

  /** Adjunta listeners con logger personalizado (socket) */
  public attachWithLogger(page: Page, logger: (msg: string) => void) {

    page.on('request', (request: Request) => {
      const type = request.resourceType();
      if (API_TYPES.includes(type)) {
        this.requestTimestamps.set(request.url(), { time: Date.now(), req: request });
        logger(`  [🔵 API ] ${request.method()} ${request.url()}`);
      }
    });

    page.on('response', async (response: Response) => {
      const request = response.request();
      const type = request.resourceType();
      const url = response.url();

      if (ASSET_TYPES[type]) {
        await this.saveAsset(response, type, url, logger);
        return;
      }

      if (!API_TYPES.includes(type)) return;

      const entry = this.requestTimestamps.get(url);
      if (!entry) return;

      const duration = Date.now() - entry.time;
      this.requestTimestamps.delete(url);

      let responseBody: string | null = null;
      try {
        const buffer = await response.body();
        const text = buffer.toString('utf-8');
        try { responseBody = JSON.stringify(JSON.parse(text), null, 2); }
        catch { responseBody = text.length < 1_000_000 ? text : '[Response too large: >1MB]'; }
      } catch { responseBody = '[Could not read response body]'; }

      let requestBody: string | null = null;
      try {
        const postData = entry.req.postData();
        if (postData) {
          try { requestBody = JSON.stringify(JSON.parse(postData), null, 2); }
          catch { requestBody = postData; }
        }
      } catch { /* no body */ }

      const apiCall: ApiCall = {
        index: this.apiIndex++,
        timestamp: new Date().toISOString(),
        method: entry.req.method(),
        url,
        resourceType: type,
        requestHeaders: entry.req.headers(),
        requestBody,
        responseStatus: response.status(),
        responseHeaders: response.headers(),
        responseBody,
        duration_ms: duration,
      };

      this.apiCalls.push(apiCall);
      const icon = response.status() < 400 ? '🟢' : '🔴';
      logger(`  [${icon} ${response.status()}] ${entry.req.method()} ${url} (${duration}ms)`);
      await this.saveApiCall(apiCall);
    });
  }

  /** Descarga asset y registra el mapa URL→ruta local */
  private async saveAsset(response: Response, type: string, url: string, logger: (msg: string) => void) {
    if (this.savedAssets.has(url)) return;
    if (response.status() < 200 || response.status() >= 400) return;

    this.savedAssets.add(url);

    try {
      const subFolder = ASSET_TYPES[type];
      const assetDir = path.join(this.outputDir, 'assets', subFolder);
      await fs.mkdir(assetDir, { recursive: true });

      const urlObj = new URL(url);
      let fileName = path.basename(urlObj.pathname) || 'index';
      fileName = fileName.split('?')[0];
      fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      if (!fileName || fileName === '_') fileName = `asset_${Date.now()}`;

      const filePath = path.join(assetDir, fileName);
      const buffer = await response.body();
      await fs.writeFile(filePath, buffer);

      // Registrar TODAS las variantes posibles de la URL para que rewriteHtml() funcione
      // tanto con rutas absolutas como relativas en el HTML capturado
      const localRelPath = `./assets/${subFolder}/${fileName}`;
      const urlObj2 = new URL(url);
      const pathname = urlObj2.pathname;                  // /estilos/login.css
      const pathnameNoSlash = pathname.replace(/^\//, ''); // estilos/login.css
      const pathnameNoQuery = pathname.split('?')[0];
      const pathnameNoSlashNoQuery = pathnameNoQuery.replace(/^\//, '');

      // URL absoluta con y sin query
      this.urlToLocalPath.set(url, localRelPath);
      this.urlToLocalPath.set(`${urlObj2.origin}${pathnameNoQuery}`, localRelPath);
      // Pathname relativo con y sin query string, con y sin barra inicial
      this.urlToLocalPath.set(pathname, localRelPath);
      this.urlToLocalPath.set(pathnameNoSlash, localRelPath);
      this.urlToLocalPath.set(`${pathname}${urlObj2.search}`, localRelPath); // /path?v=xxx
      this.urlToLocalPath.set(`${pathnameNoSlash}${urlObj2.search}`, localRelPath); // path?v=xxx

      const icons: Record<string, string> = {
        stylesheet: '🎨', script: '⚙️', image: '🖼️', font: '🔤', media: '🎬'
      };
      logger(`  [${icons[type] || '📦'} ${type.toUpperCase()}] ${fileName} (${Math.round(buffer.length / 1024)}KB)`);
    } catch { /* silencioso */ }
  }

  /**
   * Reescribe el HTML ráfaga para los snapshots rápidos cada 4 segundos.
   * Utiliza la memoria caché y es síncrono para no bloquear.
   */
  public rewriteHtml(html: string, baseUrl: string): string {
    let result = html;
    const entries = [...this.urlToLocalPath.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [originalUrl, localPath] of entries) {
      const escaped = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), localPath);
    }
    return NetworkRecorder.stripScripts(result);
  }

  public static stripScripts(html: string): string {
    // En lugar de borrar, envolvemos en comentarios HTML para preservarlos pero desactivarlos
    let result = html.replace(/(<script[\s\S]*?<\/script>)/gi, '<!-- [DISABLED_SCRIPT] $1 -->');
    result = result.replace(/(<script[^>]*\/>)/gi, '<!-- [DISABLED_SCRIPT] $1 -->');
    
    // Neutralizar handlers inline (ej: onclick -> disabled-onclick) para que sean legibles pero inofensivos
    result = result.replace(/\s+(on\w+)\s*=/gi, ' disabled-$1=');
    
    // Neutralizar links javascript:
    result = result.replace(/href\s*=\s*["']javascript:([^"']*)["']/gi, 'href="#" data-js-link="$1"');
    
    return result;
  }



  /**
   * Procesa el HTML en el momento de CERRAR la grabación:
   * 1. Parsea con JSDOM.
   * 2. Encuentra todas las imágenes, hojas de estilo y recursos.
   * 3. Extrae recursos de los `<style>` inline y descarga todo recursivamente bajo sesión segura (browser).
   * 4. Borra el JS y los handlers.
   * 5. Retorna la maqueta perfecta con rutas locales.
   */
  public async processFinalHtml(html: string, page: Page, logger: (msg: string) => void): Promise<string> {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const baseUrl = page.url();

    // 1. Array de promesas para no bloquear
    const downloadQueue: Promise<void>[] = [];

    // Función auxiliar para descargar y registrar el path
    const fetchAndMap = async (originalUrl: string, type: 'styles' | 'images' | 'media' | 'fonts' | 'scripts') => {
      try {
        const absUrl = new URL(originalUrl, baseUrl).toString();
        // Si ya lo tenemos en el mapa (vía red en vivo), usamos eso
        let localPath = this.urlToLocalPath.get(absUrl) || this.urlToLocalPath.get(absUrl.split('?')[0]);
        if (localPath) return localPath;

        // Descartar inline y externos raros si es necesario, pero trataremos de bajarlos.
        if (absUrl.startsWith('data:')) return null;

        // Bajar forzosamente por page.evaluate usando el contexto del nav
        const result = await page.evaluate(async (u) => {
          try {
            const res = await fetch(u, { credentials: 'include' });
            if (!res.ok) return null;
            const buf = await res.arrayBuffer();
            return Array.from(new Uint8Array(buf));
          } catch { return null; }
        }, absUrl);

        if (!result) return null;

        const buffer = Buffer.from(result);
        const assetDir = path.join(this.outputDir, 'assets', type);
        await fs.mkdir(assetDir, { recursive: true });

        const urlObj = new URL(absUrl);
        let fileName = path.basename(urlObj.pathname).split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `asset_${Date.now()}`;
        
        await fs.writeFile(path.join(assetDir, fileName), buffer);
        localPath = `./assets/${type}/${fileName}`;

        // Registrar en caché y mapa
        this.urlToLocalPath.set(absUrl, localPath);
        this.savedAssets.add(absUrl);
        
        const icon = { 'styles': '🎨', 'scripts': '⚙️', 'images': '🖼️', 'media': '🎬', 'fonts': '🔤' }[type] || '📦';
        logger(`  [${icon} REZAGADO] ${fileName} (${Math.round(buffer.length / 1024)}KB)`);

        return localPath;
      } catch (err) { return null; }
    };

    // 2. Extraer de atributos de HTML (Preservamos descarga de scripts para el futuro aunque los comentemos)
    const elementsToUpdate: Array<{selector: string, attr: string, type: 'images' | 'styles' | 'media' | 'fonts' | 'scripts'}> = [
      { selector: 'img', attr: 'src', type: 'images' },
      { selector: 'link[rel="stylesheet"]', attr: 'href', type: 'styles' },
      { selector: 'source', attr: 'src', type: 'media' },
      { selector: 'video', attr: 'src', type: 'media' },
      { selector: 'script[src]', attr: 'src', type: 'scripts' }
    ];


    for (const { selector, attr, type } of elementsToUpdate) {
      const els = Array.from(document.querySelectorAll(selector));
      for (const el of els) {
        let originalUrl = el.getAttribute(attr);
        if (originalUrl && !originalUrl.startsWith('data:')) {
            downloadQueue.push(
              (async () => {
                const lp = await fetchAndMap(originalUrl!, type);
                if (lp) el.setAttribute(attr, lp);
              })().catch(() => {})
            );
        }
      }
    }

    // 3. Extraer de atributos de estilo inline (ej. background-image)
    const styleEls = Array.from(document.querySelectorAll('[style]'));
    for (const el of styleEls) {
      const htmlEl = el as unknown as HTMLElement;
      if (htmlEl.style.backgroundImage) {
        let bg = htmlEl.style.backgroundImage;
        const match = bg.match(/url\(['"]?(.+?)['"]?\)/);
        if (match && match[1] && !match[1].startsWith('data:')) {
            downloadQueue.push(
              (async () => {
                const lp = await fetchAndMap(match[1], 'images');
                if (lp) {
                    bg = bg.replace(match[1], lp);
                    htmlEl.style.backgroundImage = bg;
                }
              })().catch(() => {})
            );
        }
      }
    }

    await Promise.all(downloadQueue);

    // Especial: Procesar archivos CSS guardados para descargar imágenes en url(...) y reescribirlas a ../images/...
    try {
      const stylesDir = path.join(this.outputDir, 'assets', 'styles');
      logger(`🔄 Revisando CSS en: ${stylesDir}`);
      const cssFiles = await fs.readdir(stylesDir).catch(() => []);
      
      for (const cssFile of cssFiles) {
        if (!cssFile.endsWith('.css')) continue;
        
        let originalCssUrl = "";
        for (const [key, val] of this.urlToLocalPath.entries()) {
          if (val === `./assets/styles/${cssFile}` && key.startsWith('http')) {
             originalCssUrl = key;
             break;
          }
        }
        if (!originalCssUrl) {
            logger(`⚠️ No se encontró URL original para ${cssFile}`);
            continue;
        }

        const cssPath = path.join(stylesDir, cssFile);
        let cssContent = await fs.readFile(cssPath, 'utf8');
        let changed = false;

        const regex = /url\(['"]?(.+?)['"]?\)/g;
        let match;
        const matches = [];
        while ((match = regex.exec(cssContent)) !== null) {
          matches.push({ full: match[0], path: match[1] });
        }

        for (const m of matches) {
          if (m.path.startsWith('data:') || m.path.startsWith('http')) continue;
          
          try {
            const absUrl = new URL(m.path, originalCssUrl).toString();
            const lp = await fetchAndMap(absUrl, 'images');
            if (lp) {
               const cssRelPath = lp.replace('./assets/', '../');
               if (cssContent.includes(m.path)) {
                   cssContent = cssContent.split(m.path).join(cssRelPath);
                   changed = true;
                   logger(`  [ CSS ] Parcheado ${m.path} -> ${cssRelPath}`);
               }
            } else {
               logger(`  [ CSS ERROR ] fetchAndMap devolvió null para ${absUrl}`);
            }
          } catch (e) { logger(`  [ CSS ERROR ] Procesando ${m.path}`); }
        }

        if (changed) {
          await fs.writeFile(cssPath, cssContent, 'utf8');
          logger(`✅ CSS actualizado exitosamente: ${cssFile}`);
        }
      }
    } catch (err) { logger(`❌ Error global en parcheo de CSS: ${(err as Error).message}`); }

    // 4. Comentar Scripts en lugar de borrarlos (Modo Archivo)
    document.querySelectorAll('script').forEach(el => {
      const commentText = el.outerHTML;
      const commentNode = dom.window.document.createComment(` [DISABLED_SCRIPT] ${commentText} `);
      el.parentNode?.replaceChild(commentNode, el);
    });
    
    // Neutralizar handlers inline (onclick -> disabled-onclick)
    const allElements = document.querySelectorAll('*');
    for (const el of Array.from(allElements)) {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.toLowerCase().startsWith('on')) {
          const originalName = attr.name;
          const originalValue = attr.value;
          el.setAttribute(`disabled-${originalName}`, originalValue);
          el.removeAttribute(originalName);
        }
        if (attr.name.toLowerCase() === 'href' && attr.value.toLowerCase().startsWith('javascript:')) {
          const originalJs = attr.value;
          el.setAttribute('href', '#');
          el.setAttribute('data-js-link-archived', originalJs);
        }
      });
    }


    return dom.serialize();
  }



  private async saveApiCall(apiCall: ApiCall) {
    await fs.mkdir(path.join(this.outputDir, 'api-calls'), { recursive: true });
    const urlSlug = new URL(apiCall.url).pathname
      .replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    const fileName = `${String(apiCall.index).padStart(3, '0')}_${apiCall.method}${urlSlug}.json`;
    await fs.writeFile(path.join(this.outputDir, 'api-calls', fileName), JSON.stringify(apiCall, null, 2), 'utf-8');
  }

  public async saveSessionReport(meta: { url: string; sectionName: string; startedAt: string; duration_ms: number }) {
    const report = {
      ...meta,
      totalApiCalls: this.apiCalls.length,
      totalAssets: this.savedAssets.size,
      apiCallsSummary: this.apiCalls.map(c => ({
        index: c.index, method: c.method, url: c.url,
        status: c.responseStatus, duration_ms: c.duration_ms,
      })),
    };
    const filePath = path.join(this.outputDir, 'session-report.json');
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
    return filePath;
  }

  public getCallCount() { return this.apiCalls.length; }
  public getAssetCount() { return this.savedAssets.size; }

  /**
   * Escanea el DOM actual y descarga todos los assets ya cargados.
   * Llamar al INICIAR la grabación para capturar lo que estaba antes de presionar grabar.
   */
  public async downloadCurrentAssets(page: Page, logger: (msg: string) => void): Promise<void> {
    logger('📥 Escaneando DOM para assets ya cargados...');

    type AssetEntry = { type: string; url: string };
    let assets: AssetEntry[] = [];

    try {
      assets = await page.evaluate((): { type: string; url: string }[] => {
        const r: { type: string; url: string }[] = [];
        document.querySelectorAll('link[rel="stylesheet"][href]').forEach(el => {
          const href = (el as HTMLLinkElement).href;
          if (href && !href.startsWith('data:')) r.push({ type: 'stylesheet', url: href });
        });
        document.querySelectorAll('script[src]').forEach(el => {
          const src = (el as HTMLScriptElement).src;
          if (src && !src.startsWith('data:')) r.push({ type: 'script', url: src });
        });
        document.querySelectorAll('img[src]').forEach(el => {
          const src = (el as HTMLImageElement).src;
          if (src && !src.startsWith('data:')) r.push({ type: 'image', url: src });
        });
        return r;
      });
    } catch { /* silencioso */ }

    logger(`📦 ${assets.length} assets en DOM. Descargando...`);

    for (const asset of assets) {
      if (this.savedAssets.has(asset.url)) continue;
      try {
        const result = await page.evaluate(async (url: string) => {
          try {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return null;
            const buf = await res.arrayBuffer();
            return Array.from(new Uint8Array(buf));
          } catch { return null; }
        }, asset.url);

        if (!result) continue;

        const buffer = Buffer.from(result);
        const subFolder = ({ stylesheet: 'styles', script: 'scripts', image: 'images' } as Record<string, string>)[asset.type] ?? 'misc';
        const assetDir = path.join(this.outputDir, 'assets', subFolder);
        await fs.mkdir(assetDir, { recursive: true });

        const urlObj = new URL(asset.url);
        let fileName = path.basename(urlObj.pathname).split('?')[0]
          .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `asset_${Date.now()}`;

        await fs.writeFile(path.join(assetDir, fileName), buffer);

        // Registrar TODAS las variantes de la URL para que rewriteHtml() funcione
        const localRelPath = `./assets/${subFolder}/${fileName}`;
        const urlObjA = new URL(asset.url);
        const pathname = urlObjA.pathname;
        const pathnameNoSlash = pathname.replace(/^\//, '');
        const pathnameNoQuery = pathname.split('?')[0];
        const pathnameNoSlashNoQuery = pathnameNoQuery.replace(/^\//, '');

        this.urlToLocalPath.set(asset.url, localRelPath);
        this.urlToLocalPath.set(`${urlObjA.origin}${pathnameNoQuery}`, localRelPath);
        this.urlToLocalPath.set(pathname, localRelPath);
        this.urlToLocalPath.set(pathnameNoSlash, localRelPath);
        this.urlToLocalPath.set(`${pathname}${urlObjA.search}`, localRelPath);
        this.urlToLocalPath.set(`${pathnameNoSlash}${urlObjA.search}`, localRelPath);
        this.savedAssets.add(asset.url);

        const icons: Record<string, string> = { stylesheet: '🎨', script: '⚙️', image: '🖼️' };
        logger(`  [${icons[asset.type] ?? '📦'} DOM] ${fileName} (${Math.round(buffer.length / 1024)}KB)`);
      } catch { /* silencioso por asset */ }
    }

    logger('✅ Assets del DOM descargados.');
  }
}
