// Tiny local server for tests and quick checks (no dependencies, no Vercel login needed).
// - serves /public as static files
// - runs /api/<name>.js handlers with a Vercel-like req/res (req.query, req.body, res.status().json())
// - loads .env.local into process.env if it exists (values are never printed)
//
// Usage: node scripts/dev-server.js [port]     (default 3000)

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

if (existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// Adds the helpers Vercel functions expect on `res`.
function wrapRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => { res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); return res; };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  if ((req.headers['content-type'] || '').includes('application/json')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

async function handleApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9-]+$/i.test(name)) return wrapRes(res).status(404).json({ error: 'not found' });
  const file = path.join(ROOT, 'api', name + '.js');
  if (!existsSync(file)) return wrapRes(res).status(404).json({ error: 'not found' });
  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);
  const mod = await import(pathToFileURL(file).href);
  try {
    await mod.default(req, wrapRes(res));
  } catch (e) {
    console.error(`api/${name} crashed:`, e.message);
    if (!res.headersSent) res.status(500).json({ error: 'server error' });
  }
}

async function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end(); }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return handleStatic(req, res, url);
});

server.listen(PORT, () => console.log(`Crosswise dev server on http://localhost:${PORT}`));
