PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recipe (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  source TEXT NOT NULL DEFAULT '原创',
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_version (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  fork_of_version_id TEXT REFERENCES recipe_version(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '',
  is_base INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingredient_spec (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES recipe_version(id) ON DELETE CASCADE,
  raw_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS meal (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  meal_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS meal_item (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_version(id) ON DELETE CASCADE,
  submitter TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  UNIQUE(meal_id, recipe_version_id)
);

CREATE TABLE IF NOT EXISTS meal_prep_entry (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  total_quantity REAL NOT NULL DEFAULT 0,
  available REAL,
  shortage REAL,
  prepared INTEGER NOT NULL DEFAULT 0,
  prepared_at TEXT
);

CREATE TABLE IF NOT EXISTS inventory_item (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(canonical_name, unit)
);

CREATE TABLE IF NOT EXISTS inventory_log (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  op TEXT NOT NULL,
  delta REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  operator TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_log (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL UNIQUE REFERENCES meal(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL DEFAULT '',
  rating TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_log_photo (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_log_photo_meal
ON meal_log_photo(meal_id);

CREATE TABLE IF NOT EXISTS family_member (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  color TEXT NOT NULL DEFAULT '#5B8C5A',
  openid TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_member_openid
ON family_member(openid)
WHERE openid IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_session (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_session_member
ON auth_session(member_id);

CREATE INDEX IF NOT EXISTS idx_auth_session_expires
ON auth_session(expires_at);

CREATE TABLE IF NOT EXISTS meal_item_submission (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_version(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
  member_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  UNIQUE(meal_id, recipe_version_id, member_id)
);
