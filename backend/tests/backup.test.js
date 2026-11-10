import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { listUploadBackupDirs } = await import('../scripts/backup.js');

test('备份清理只把 uploads- 开头的目录视为备份', (t) => {
  const backupDir = mkdtempSync(join(tmpdir(), 'backup-prune-'));
  t.after(() => rmSync(backupDir, { recursive: true, force: true }));

  mkdirSync(join(backupDir, 'uploads-new'));
  mkdirSync(join(backupDir, 'uploads-old'));
  writeFileSync(join(backupDir, 'uploads-file'), 'not a directory');
  writeFileSync(join(backupDir, 'app-1.db'), 'db');

  assert.deepEqual(listUploadBackupDirs(backupDir), ['uploads-new', 'uploads-old']);
});
