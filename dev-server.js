// Local preview: serves the static pages and /api/analyze. Run: npm run dev
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import handler from './api/analyze.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };
const root = process.cwd();

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/analyze')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.body = raw;
    res.status = code => { res.statusCode = code; return res; };
    res.json = obj => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
    return handler(req, res);
  }
  const path = normalize(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]);
  try {
    const data = await readFile(join(root, path));
    res.setHeader('content-type', TYPES[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
