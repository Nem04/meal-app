import { randomUUID } from 'node:crypto';

export function uuid() {
  return randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// JSON 响应统一包装。
export function json(res, status, data) {
  const body = JSON.stringify({ ok: status < 400, data });
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

export function ok(res, data) { json(res, 200, data ?? null); }
export function created(res, data) { json(res, 201, data ?? null); }
export function fail(res, status, message, code = 'BAD_REQUEST') {
  json(res, status, { error: message, code });
}
