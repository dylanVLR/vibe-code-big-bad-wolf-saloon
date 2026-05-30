// Minimal static file server for local preview: node tools/serve.js
import http from 'http';
import { readFile } from 'fs';
import { extname, join, normalize } from 'path';

const root = process.cwd();
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8123, () => console.log('serving on http://localhost:8123'));
