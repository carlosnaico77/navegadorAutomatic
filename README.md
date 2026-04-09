# 🌌 Scraper | Platinum Edition 🚀

**Scraper** es una plataforma profesional de automatización y clonación de sitios web, diseñada bajo una arquitectura **Orientada a Objetos (POO)** de alta fidelidad. Combina el poder de **Playwright** con una interfaz de usuario de vanguardia para ofrecer una experiencia de mirroring web sin precedentes.

---

## 🌟 Características de Clase Mundial

### 🎨 Dashboard Premium
Interactúa con una interfaz moderna y premium con estética de vidrio esmerilado (`backdrop-blur`), efectos de neón y una terminal de monitorización en tiempo real vía WebSockets. Una herramienta diseñada no solo para funcionar, sino para impresionar.

### 🔐 Persistencia de Sesión e Inteligencia Auth
Gracias a su integración con `launchPersistentContext`, Aurora puede heredar tus sesiones activas. 
- **Alimentación de Credenciales**: Usa el comando `npm run login` para entrar manualmente a sitios, loguearte y "enseñar" al bot tus accesos.
- **Acceso a Portales Privados**: Una vez logueado, el bot puede clonar áreas privadas de portales web como si fueras un usuario real navegando.

### 🛠️ Arquitectura Modular Pro
El sistema está construido sobre cimientos de código limpio:
- **`ScraperEngine`**: Motor persistente con evasión de detección (Channel Chrome).
- **`ResourceDownloader`**: Clonación recursiva de activos con caché inteligente.
- **`StorageManager`**: Organización perfecta de archivos basada en dominios y rutas.
- **`AnalysisOrchestrator`**: El cerebro que coordina la extracción y la persistencia.

---

## 🚀 Guía de Inicio Rápido

### 1. Instalación
Prepara el entorno instalando las dependencias:
```bash
npm install
```

### 2. Alimentar el Sistema (Auth)
Si necesitas clonar sitios que requieren login, inicia una sesión manual:
```bash
npm run login
```
*Se abrirá Chrome. Loguéate en los sitios que necesites y cierra el navegador para guardar la sesión.*

### 3. Lanzar el Dashboard
Inicia el centro de control interactivo:
```bash
npm run dashboard
```
Accede en: [http://localhost:3000](http://localhost:3000)

---

## 📂 Organización de Salida (Mirroring)

Cada escaneo genera una estructura autocontenida en la carpeta `outputs/`:
- `analisis.html`: El clon idéntico del sitio, listo para navegar offline.
- `captura.png`: Snapshot visual de alta resolución para previsualización.
- `assets/`: Galería de recursos locales (CSS, JS, Imágenes) procesados para fidelidad total.

---

## 🛡️ Evasión y Seguridad
El sistema utiliza configuraciones avanzadas para evitar ser detectado por cortafuegos comunes:
- Desactivación de `AutomationControlled`.
- Uso de binarios oficiales de Chrome.
- Gestión de `user-agent` real y persistencia de cookies.

---
**Proyecto desarrollado con estándares POO y Clean Code.**  
Mantenido por **Carlos Lozano**.
