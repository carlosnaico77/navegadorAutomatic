import path from 'node:path';
import fs from 'node:fs/promises';

export class StorageManager {
  private baseOutputDir: string;

  constructor(outputDir: string = 'outputs') {
    this.baseOutputDir = path.join(process.cwd(), outputDir);
  }

  /**
   * Resuelve la ruta física basada en la URL, cumpliendo la regla de /inicio
   */
  public resolvePath(url: string): { domain: string, subPath: string, fullPath: string } {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Regla de oro: Si el path es vacío o /, lo llamamos 'inicio'
    let cleanPath = urlObj.pathname.replace(/^\/|\/$/g, '');
    if (!cleanPath) cleanPath = 'inicio';

    const pathParts = cleanPath.split('/');
    const fullPath = path.join(this.baseOutputDir, domain, ...pathParts);

    return { domain, subPath: cleanPath, fullPath };
  }

  /**
   * Asegura que el directorio exista
   */
  public async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Guarda el HTML final en la ubicación correspondiente
   */
  public async saveHtml(dirPath: string, content: string): Promise<string> {
    const filePath = path.join(dirPath, 'analisis.html');
    await fs.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Guarda la captura de pantalla en formato base64
   */
  public async saveScreenshot(dirPath: string, base64Data: string): Promise<string> {
    const filePath = path.join(dirPath, 'captura.png');
    await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
    return filePath;
  }

  /**
   * Obtiene la ruta relativa para el frontend (URL amigable)
   */
  public getRelativeUrl(fullPath: string): string {
    const relative = path.relative(this.baseOutputDir, fullPath).replace(/\\/g, '/');
    return `/outputs/${relative}`;
  }
}
