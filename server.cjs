const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const files = {
  '/index.html': 'text/html; charset=utf-8',
  '/styles.css': 'text/css; charset=utf-8',
  '/csv.js': 'text/javascript; charset=utf-8',
  '/app.js': 'text/javascript; charset=utf-8',
  '/sw.js': 'text/javascript; charset=utf-8',
  '/manifest.webmanifest': 'application/manifest+json',
  '/icon-192.png': 'image/png',
  '/icon-512.png': 'image/png'
};
const port = Number(process.env.PORT || 5173);
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/' ? '/index.html' : pathname;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  if (!Object.hasOwn(files, file)) { res.writeHead(404); res.end('No encontrado'); return; }
  try {
    const bytes = await fs.readFile(path.join(__dirname, file));
    res.writeHead(200, { 'Content-Type': files[file], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(500); res.end('No se pudo leer el archivo'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Mis Gastos: http://localhost:${port}`));
