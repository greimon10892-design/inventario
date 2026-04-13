/**
 * build.js — ejecuta con: node build.js
 * Genera la carpeta /dist lista para subir a Netlify.
 * Inyecta un timestamp único en cada build para invalidar caché móvil.
 */
const fs   = require('fs');
const path = require('path');

const DIST  = path.join(__dirname, 'dist');
const BUILD = Date.now().toString(36); // ej: "lzx4k2a"

// Limpia y crea dist/
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST);

// Copia y procesa cada archivo
const files = ['index.html', 'styles.css', 'app.js', 'sw.js'];

files.forEach(file => {
  let content = fs.readFileSync(path.join(__dirname, file), 'utf8');

  if (file === 'index.html') {
    // Inyecta versión en CSS y JS
    content = content
      .replace(/styles\.css(\?v=\w+)?/, `styles.css?v=${BUILD}`)
      .replace(/app\.js(\?v=\w+)?/,     `app.js?v=${BUILD}`);
  }

  if (file === 'sw.js') {
    // Inyecta el timestamp real
    content = content.replace('__BUILD_TIME__', BUILD);
  }

  fs.writeFileSync(path.join(DIST, file), content);
});

// Crea _headers para Netlify (deshabilita caché en HTML)
fs.writeFileSync(path.join(DIST, '_headers'), `
/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable
`.trim());

console.log(`✓ Build ${BUILD} generado en /dist — listo para subir a Netlify`);
