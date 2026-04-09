import { ScraperEngine } from './analyzer.js';

/**
 * Script independiente para alimentar la sesión (Manual Login)
 */
async function runManualLogin() {
  console.log('--- MODO LOGIN MANUAL ---');
  console.log('Abriendo navegador persistente en src/auth...');
  console.log('Por favor, entra a las webs que necesites y loguéate.');
  console.log('Cuando termines, CIERRA EL NAVEGADOR para guardar los cambios.');

  const engine = new ScraperEngine({ headless: false });
  
  try {
    await engine.init();
    // No hacemos nada, solo esperamos a que el usuario cierre el navegador manual
    // o que pasen 10 minutos
    console.log('Esperando interacción humana...');
  } catch (error) {
    console.error('Error al iniciar sesión manual:', error);
  }
}

runManualLogin();
