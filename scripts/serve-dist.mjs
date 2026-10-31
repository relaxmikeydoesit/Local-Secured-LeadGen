#!/usr/bin/env node
// Tiny static server for dist/ that applies public/_headers, so local previews and the CI
// ZAP scan see the same security headers Cloudflare Pages will send.
//
//   node scripts/serve-dist.mjs [dir=dist] [port=4321]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';

const root = normalize(join(process.cwd(), process.argv[2] || 'dist'));
const port = Number(process.argv[3] || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

// Parse the global ("/*") block of _headers.
const globalHeaders = {};
try {
  const raw = await readFile(join(root, '_headers'), 'utf8');
  let inGlobal = false;
  for (const line of raw.split('\n')) {
    if (/^\S/.test(line)) { inGlobal = line.trim() === '/*'; continue; }
    if (!inGlobal) continue;
    const i = line.indexOf(':');
    if (i > 0) globalHeaders[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
} catch { /* no _headers file */ }

async function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed percent-encoding must not crash the server
  }
  if (decoded.includes('\0')) return null;
  const p = normalize(join(root, decoded));
  if (p !== root && !p.startsWith(root + sep)) return null; // path traversal guard
  try {
    const s = await stat(p);
    if (s.isDirectory()) return join(p, 'index.html');
    return p;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  let file = await resolveFile(pathname);
  let status = 200;
  if (!file) { file = join(root, '404.html'); status = 404; }
  try {
    const body = await readFile(file);
    res.writeHead(status, { ...globalHeaders, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, globalHeaders);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} at http://127.0.0.1:${port}`));
