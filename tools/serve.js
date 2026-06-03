// Minimal static file server for local preview: node tools/serve.js
import http from 'http';
import { readFile } from 'fs';
import { extname, join, normalize } from 'path';

const root = process.cwd();
const PORT = process.env.PORT || 8123;

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.json': 'application/json', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const path = req.url.split('?')[0];

  // ── Static files ──────────────────────────────────────────────────────
  let p = decodeURIComponent(path);
  if (p === '/') p = '/index.html';
  const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`serving on http://localhost:${PORT}`));
