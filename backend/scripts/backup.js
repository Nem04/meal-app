import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = process.env.DATA_DIR || '/app/data';
const backupDir = join(dataDir, 'backups');
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(backupDir, `app-${stamp}.db`);
const db = new DatabaseSync(join(dataDir, 'app.db'));

db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();

const backups = readdirSync(backupDir)
  .filter((name) => name.startsWith('app-') && name.endsWith('.db'))
  .sort();
for (const old of backups.slice(0, -30)) {
  unlinkSync(join(backupDir, old));
}

console.log(`backup created: ${target}`);
