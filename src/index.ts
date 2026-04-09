import { AnalysisOrchestrator } from './core/AnalysisOrchestrator.js';

const orchestrator = new AnalysisOrchestrator();

async function bootstrap() {
  // En el modo CLI podemos pasar argumentos o usar una URL fija para pruebas rápido
  const url = process.argv[2] || 'https://www.fcbarcelona.es/';
  
  console.log(`\n🚀 Iniciando Scraper Ultra (Modo CLI)\n`);
  
  try {
    await orchestrator.execute(url, (msg) => {
      console.log(`[LOG] ${msg}`);
    });
    
    console.log(`\n✅ Proceso terminado con éxito.`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error en el proceso:`, error);
    process.exit(1);
  }
}

bootstrap();
