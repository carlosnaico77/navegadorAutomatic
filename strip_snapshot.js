const fs = require('fs');
const file = 'outputs/fibex.saeplus.com/login/snapshot.html';
let html = fs.readFileSync(file, 'utf-8');

// Eliminar <script>...</script> (inline y con src)
html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
// Eliminar atributos de evento inline
html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
// Eliminar javascript: en href
html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

fs.writeFileSync(file, html, 'utf-8');
console.log('snapshot.html limpiado (sin JS). Tamaño:', html.length, 'chars');
