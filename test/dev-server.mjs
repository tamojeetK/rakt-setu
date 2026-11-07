// Local stand-in for Vercel: serves public/ with clean URLs and runs api/*.js.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (u.pathname.startsWith('/rest/v1/') && process.env.POSTGREST) { // mimic Supabase's URL layout
    let raw = ''; for await (const c of req) raw += c;
    const r = await fetch(process.env.POSTGREST + u.pathname.slice(8) + u.search, { method: req.method, headers: { 'content-type': 'application/json', authorization: req.headers.authorization || '' }, body: raw || undefined });
    res.statusCode = r.status; res.setHeader('content-type', 'application/json'); return res.end(await r.text());
  }
  if (u.pathname.startsWith('/api/')) {
    req.query = Object.fromEntries(u.searchParams);
    let raw = ''; for await (const c of req) raw += c;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
    try { const m = await import(join(root, 'api', u.pathname.slice(5).replace(/[^a-z]/g, '') + '.js')); return m.default(req, res); }
    catch { return res.status(404).json({ error: 'nope' }); }
  }
  let p = normalize(u.pathname).replace(/^\/+/, '') || 'index.html';
  if (!extname(p)) p += '.html';
  try { const b = await readFile(join(root, 'public', p)); res.setHeader('content-type', types[extname(p)] || 'application/octet-stream'); res.end(b); }
  catch { res.statusCode = 404; res.end('not found'); }
}).listen(process.env.PORT || 3000, () => console.log('dev on', process.env.PORT || 3000));
