import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const port = Number(process.env.UI_PORT ?? 8090);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function safePath(urlPath) {
  const cleaned = normalize(urlPath).replace(/^([.][.][/\\])+/, '');
  return join(ROOT, cleaned);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const pathname = url.pathname === '/' ? '/playground/index.html' : url.pathname;
  const filePath = safePath(pathname);

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const type = mime[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`[ui-server] http://localhost:${port}`);
  console.log('[ui-server] open / to use visual playground');
});
