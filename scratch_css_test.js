import fs from 'fs';

async function test() {
  let cssContent = fs.readFileSync('outputs/login/assets/styles/login.css', 'utf-8');
  let changed = false;

  const regex = /url\(['"]?(.+?)['"]?\)/g;
  let match;
  const matches = [];
  while ((match = regex.exec(cssContent)) !== null) {
      matches.push({ full: match[0], path: match[1] });
  }

  const originalCssUrl = "https://fibex.saeplus.com/estilos/login.css"; // assuming

  for (const m of matches) {
      if (m.path.startsWith('data:') || m.path.startsWith('http')) continue;
      
      try {
          const absUrl = new URL(m.path, originalCssUrl).toString();
          console.log(`Matched path: ${m.path} -> Absolute: ${absUrl}`);
          
          // Let's pretend fetchAndMap gave us this:
          const lp = `./assets/images/bg2.jpg`;
          const cssRelPath = lp.replace('./assets/', '../');
          
          cssContent = cssContent.split(m.path).join(cssRelPath);
          changed = true;
          console.log(`Replaced ${m.path} with ${cssRelPath}`);
      } catch (e) {
          console.log("Error on URL " + m.path, e);
      }
  }

  console.log("Changed?", changed);
}

test();
