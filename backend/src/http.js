// 静态文件服务。
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLogPhotoFile } from './media/logPhotoStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'frontend', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const LOG_PHOTO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function serveLogPhotoFile(pathname, res, dataDir) {
  const prefix = '/media/log-photos/';
  const fileName = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  let filePath;
  try {
    filePath = resolveLogPhotoFile(dataDir, fileName);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': LOG_PHOTO_MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  });
  const stream = createReadStream(filePath);
  stream.on('error', (error) => {
    if (res.headersSent) {
      res.destroy(error);
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });
  stream.pipe(res);
}

export function serveStatic(pathname, res) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const safe = normalize(join(PUBLIC_DIR, filePath));
  if (!safe.startsWith(normalize(PUBLIC_DIR))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!existsSync(safe) || !statSync(safe).isFile()) {
    // SPA 兜底：未知路径回首页。
    const index = join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(index).pipe(res);
    return;
  }
  const ext = extname(safe).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  createReadStream(safe).pipe(res);
}
