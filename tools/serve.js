// Minimal static file server for local preview: node tools/serve.js
//
// Plus a LOCALHOST-ONLY deploy hook so the in-game "🚀 Push to Web" dev button
// can trigger ./deploy.sh:
//   GET  /__deploy  → capability ping (so the button knows it can deploy)
//   POST /__deploy  → runs ./deploy.sh and returns the result
// This only exists on the local dev server — the live site has no backend, so
// the button is inert there (safe by design).
import http from 'http';
import { readFile } from 'fs';
import { extname, join, normalize, dirname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = process.cwd();
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..'); // deploy.sh lives here

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.json': 'application/json',
  '.ico': 'image/x-icon',
};

let deploying = false;

/** Only allow the deploy hook from the local machine. */
function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

http.createServer((req, res) => {
  const path = req.url.split('?')[0];

  // ── Deploy hook (localhost only) ──────────────────────────────────────
  if (path === '/__deploy') {
    if (!isLocal(req)) { res.writeHead(403); res.end('forbidden'); return; }

    if (req.method === 'GET') {                        // capability ping
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ capable: true, busy: deploying }));
      return;
    }

    if (req.method === 'POST') {                        // run the deploy
      if (deploying) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'A deploy is already running.' }));
        return;
      }
      deploying = true;
      const started = Date.now();
      console.log('\n▶ /__deploy: running ./deploy.sh …');
      const child = spawn('bash', ['deploy.sh'], { cwd: projectRoot, env: process.env });
      let out = '';
      child.stdout.on('data', d => { out += d; process.stdout.write(d); });
      child.stderr.on('data', d => { out += d; process.stderr.write(d); });
      child.on('close', code => {
        deploying = false;
        const tail = out.split('\n').filter(Boolean).slice(-8).join('\n');
        console.log(`▶ /__deploy: finished (exit ${code})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: code === 0, code, durationMs: Date.now() - started, tail }));
      });
      child.on('error', err => {
        deploying = false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      });
      return;
    }

    res.writeHead(405); res.end('method not allowed');
    return;
  }

  // ── Static files ──────────────────────────────────────────────────────
  let p = decodeURIComponent(path);
  if (p === '/') p = '/index.html';
  const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8123, () => console.log('serving on http://localhost:8123  (POST /__deploy enabled)'));
