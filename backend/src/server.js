import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { URL } from 'node:url';
import { config } from './config.js';
import { openDb } from './db.js';
import { handle } from './routes.js';
import { serveStatic } from './http.js';
import { fail } from './util.js';

openDb();

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (config.passcode) {
    const token = req.headers['x-family-passcode'] || '';
    if (token !== config.passcode) {
      fail(res, 401, '需要家庭口令');
      return;
    }
  }

  // 业务接口统一走 /api。
  if (pathname.startsWith('/api/')) {
    const apiPath = pathname.replace(/^\/api/, '');
    const apiUrl = new URL(apiPath + url.search, 'http://localhost');
    handle(req, res, apiUrl);
    return;
  }

  // /api/calendar 等非 /api 前缀的口令态也在 /api 下；其余走静态资源。
  serveStatic(pathname, res);
});

server.listen(config.port, config.host, () => {
  const ifaces = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) ifaces.push(a.address);
    }
  }
  console.log('家庭点菜已启动：');
  console.log(`  本机访问: http://localhost:${config.port}`);
  for (const ip of ifaces) {
    console.log(`  局域网访问: http://${ip}:${config.port}`);
  }
  if (config.passcode) console.log('  已启用家庭口令保护');
});
