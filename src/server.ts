import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { AnalysisOrchestrator } from './core/AnalysisOrchestrator.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const PORT = 3000;
const OUTPUTS_DIR = path.join(process.cwd(), 'outputs');
const orchestrator = new AnalysisOrchestrator();

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'src', 'public')));
app.use('/outputs', express.static(OUTPUTS_DIR));

// Redirección por si el usuario entra en /dashboard manualmente
app.get('/dashboard', (req, res) => res.redirect('/'));

/**
 * Escanea recursivamente la carpeta outputs en busca de archivos analisis.html
 */
async function obtenerPaginasScrapeadas(dir: string): Promise<any[]> {
  const paginas: any[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subPaginas = await obtenerPaginasScrapeadas(fullPath);
        paginas.push(...subPaginas);
      } else if (entry.name === 'analisis.html') {
        const relativePath = path.relative(OUTPUTS_DIR, fullPath).replace(/\\/g, '/');
        const parts = relativePath.split('/');
        
        paginas.push({
          dominio: parts[0],
          nombre: parts.slice(1, -1).join('/') || 'Raíz',
          urlLocal: `/outputs/${relativePath}`,
          fecha: (await fs.stat(fullPath)).mtime
        });
      }
    }
  } catch (e) {
    // Carpeta vacía o no existe
  }
  return paginas;
}

// API para listar páginas
app.get('/api/paginas', async (req, res) => {
  const paginas = await obtenerPaginasScrapeadas(OUTPUTS_DIR);
  paginas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  res.json(paginas);
});

// WebSocket para el análisis
io.on('connection', (socket) => {
  console.log('Cliente Dashboard conectado');

  socket.on('iniciar-analisis', async (url) => {
    try {
      const result = await orchestrator.execute(url, (msg) => {
        socket.emit('log', msg);
      });

      socket.emit('finalizado', { 
        dominio: result.pathInfo.domain, 
        nombre: result.pathInfo.subPath,
        urlLocal: result.urlLocal
      });
    } catch (error) {
      socket.emit('error', (error as Error).message);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Dashboard iniciado en http://localhost:${PORT}`);
});
