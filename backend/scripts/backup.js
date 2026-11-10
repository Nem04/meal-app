import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';

const dataDir = config.dataDir;

export function listUploadBackupDirs(backupDir) {
  return readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('uploads-'))
    .map((entry) => entry.name)
    .sort();
}

function runBackup() {
  const backupDir = join(dataDir, 'backups');
  mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(backupDir, `app-${stamp}.db`);
  const db = new DatabaseSync(join(dataDir, 'app.db'));

  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  db.close();

  const uploadsDir = join(dataDir, 'uploads');
  const uploadsBackupDir = join(backupDir, `uploads-${stamp}`);
  if (existsSync(uploadsDir)) {
    cpSync(uploadsDir, uploadsBackupDir, { recursive: true });
  }

  const dbBackups = readdirSync(backupDir)
    .filter((name) => name.startsWith('app-') && name.endsWith('.db'))
    .sort();
  for (const old of dbBackups.slice(0, -30)) {
    unlinkSync(join(backupDir, old));
  }

  for (const old of listUploadBackupDirs(backupDir).slice(0, -30)) {
    rmSync(join(backupDir, old), { recursive: true, force: true });
  }

  console.log(`backup created: ${target}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup();
}
