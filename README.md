# Scraper Ultra 🚀 (Modo Estable)

Herramienta profesional de automatización, clonación y análisis de sitios web basada en una arquitectura **Orientada a Objetos (POO)** limpia y escalable.

## 🌟 Características de Nivel Pro

- **Arquitectura Modular POO**: Sistema diseñado con desacoplamiento total, facilitando la extensión del código.
- **Clonación Offline de Alta Fidelidad**: Captura física de HTML, CSS e imágenes (procesamiento recursivo de recursos).
- **Dashboard Visual Premium**: Interfaz moderna con logs en tiempo real vía WebSockets para una monitorización total.
- **Inteligencia de Rutas**: Normalización automática de URLs (ej: `/` se traduce de forma inteligente a `/inicio`) para una organización de archivos perfecta.
- **Auto-Scroll & Renderizado**: Espera inteligente para asegurar que el contenido cargado por JavaScript se capture correctamente.

## 🛠️ Arquitectura del Sistema

El proyecto se divide en componentes especializados:

1.  **`ScraperEngine`** (en `analyzer.ts`): Gestiona el ciclo de vida de Playwright y la extracción de datos crudos.
2.  **`ResourceDownloader`** (en `downloader.ts`): Motor de descargas con caché de sesión y reescritura de rutas CSS.
3.  **`StorageManager`**: Cerebro de la persistencia que organiza el árbol de directorios de salida.
4.  **`AnalysisOrchestrator`**: Coordinador central que une todas las piezas en un flujo de trabajo unificado.

## 🚀 Inicio Rápido

### Instalación
```bash
npm install
```

### Ejecutar el Dashboard (Recomendado)
```bash
npm run dashboard
```
Accede a la interfaz en [http://localhost:3000](http://localhost:3000).

### Ejecutar vía Consola (CLI)
```bash
npm run dev https://url-que-quieras.com
```

## 📂 Organización de Salida

Cada análisis genera una estructura limpia en la carpeta `outputs/`:
- `analisis.html`: El sitio clonado y listo para navegar offline.
- `captura.png`: Snapshot visual a pantalla completa.
- `assets/`: Todos los recursos (imágenes, estilos) aislados por página.

---
Mantenido bajo estándares de código limpio y POO.
Creado por Carlos Lozano.
