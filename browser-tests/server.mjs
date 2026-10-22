// Tiny static server for the browser tests: the fixture page plus the real
// built extension content bundle, served exactly as files on disk.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ['/fixture/editor.html', ['fixture/editor.html', 'text/html; charset=utf-8']],
  ['/content.js', ['../extension-dist/content/content.js', 'text/javascript; charset=utf-8']],
  ['/content.css', ['../extension-dist/content/styles.css', 'text/css; charset=utf-8']]
]);
const server = createServer(async (request, response) => {
  const route = routes.get(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
  if (!route) { response.writeHead(404).end('not found'); return; }
  try {
    const body = await readFile(resolve(here, route[0]));
    response.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' }).end(body);
  } catch {
    response.writeHead(500).end('fixture asset missing: run the extension build first');
  }
});
server.listen(8931, '127.0.0.1', () => console.log('textheat browser-test server on http://127.0.0.1:8931'));
