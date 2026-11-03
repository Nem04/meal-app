import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

// 打开（必要时创建）SQLite 数据库，并建表。
// 支持 config.dataDir = ':memory:' 用于测试。
export function openDb() {
  if (db) return db;

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

  if (config.dataDir === ':memory:') {
    db = new DatabaseSync(':memory:');
  } else {
    const dataDir = config.dataDir ? config.dataDir : join(__dirname, '..', '..', 'data');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'app.db');
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
  }

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schema);

  const seedCount = db.prepare('SELECT COUNT(*) AS n FROM recipe').get().n;
  if (seedCount === 0) seed(db);

  return db;
}

export function closeDbForTest() {
  if (db) {
    db.close();
    db = null;
  }
}

function seed(database) {
  const t = new Date().toISOString();
  const r1 = 'recipe-seed-001';
  const v1 = 'recipe-seed-001-v1';
  database.prepare(
    'INSERT INTO recipe(id,name,category,source,current_version_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)'
  ).run(r1, '番茄炒蛋', '素', '示例', v1, t, t);
  database.prepare(
    'INSERT INTO recipe_version(id,recipe_id,fork_of_version_id,title,steps,is_base,created_at) VALUES(?,?,NULL,?,?,1,?)'
  ).run(v1, r1, '番茄炒蛋', '1. 番茄切块；2. 鸡蛋打散；3. 炒蛋盛出，炒番茄出汁，再下蛋、调味、撒葱花。', t);
  const specs = [
    ['番茄', '番茄', 2, '个', ''], ['鸡蛋', '鸡蛋', 3, '个', ''],
    ['小葱', '葱', 1, '根', ''], ['盐', '盐', 1, '小勺', '']
  ];
  const ins = database.prepare(
    'INSERT INTO ingredient_spec(id,version_id,raw_name,canonical_name,quantity,unit,note) VALUES(?,?,?,?,?,?,?)'
  );
  for (const [raw, cname, qty, unit, note] of specs) {
    ins.run(`${v1}-${raw}`, v1, raw, cname, qty, unit, note);
  }
}
