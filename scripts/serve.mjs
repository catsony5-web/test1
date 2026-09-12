import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRoot, publicAssets, resolvePublicFile } from './lib/public-assets.mjs';

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

// Development stays network-backed after an old production worker is replaced.
// No fetch handler, cache deletion or private storage access is needed.
const developmentWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));\n`;

export async function createPreviewServer(root = projectRoot, { production = false } = {}) {
  const allowed = new Set(await publicAssets(root));
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const port = req.socket.localPort;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) {
      res.writeHead(403).end(); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD'); res.writeHead(405).end(); return;
    }
    try {
      const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const name = requestPath === '/' ? 'index.html' : requestPath.slice(1);
      if (!requestPath.startsWith('/') || !allowed.has(name)) {
        res.writeHead(404).end(); return;
      }
      const file = await resolvePublicFile(root, name);
      const body = name === 'service-worker.js' && !production
        ? Buffer.from(developmentWorker) : await readFile(file);
      res.setHeader('Content-Type', contentTypes[extname(name)] || 'text/plain; charset=utf-8');
      res.setHeader('Content-Length', body.length);
      res.writeHead(200).end(req.method === 'HEAD' ? undefined : body);
    } catch {
      // Do not expose filesystem paths or file contents in errors.
      res.writeHead(404).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const production = args[0] === '--dist';
  if (production) args.shift();
  if (args.length && (args.length !== 2 || args[0] !== '--port')) throw new Error('Usage: node scripts/serve.mjs [--dist] [--port 4173]');
  const port = Number(args[1] || (production ? 4174 : 4173));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535');
  const server = await createPreviewServer(production ? resolve(projectRoot, 'dist') : projectRoot, { production });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? 'Port is already in use. Choose another --port.' : 'Could not start preview server.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/ (${production ? 'dist with offline worker' : 'development without offline cache'}, public assets only)`));
}
