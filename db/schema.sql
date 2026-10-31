PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','moderator','admin')),
  trust_score REAL NOT NULL DEFAULT 1.0,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gtfs_stop_id TEXT UNIQUE,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  location_type INTEGER NOT NULL DEFAULT 0,
  search_name TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_stations_lat_lon ON stations(lat, lon);
CREATE INDEX IF NOT EXISTS idx_stations_search_name ON stations(search_name);

CREATE TABLE IF NOT EXISTS station_search_terms (
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  PRIMARY KEY (station_id, term)
);
CREATE INDEX IF NOT EXISTS idx_station_search_term ON station_search_terms(term, station_id);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line TEXT NOT NULL,
  headsign TEXT NOT NULL,
  service_date TEXT NOT NULL,
  official_delay_min INTEGER NOT NULL DEFAULT 0,
  cancelled INTEGER NOT NULL DEFAULT 0,
  source_trip_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(service_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_source ON trips(service_date, source_trip_id) WHERE source_trip_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trip_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  planned_arr INTEGER,
  planned_dep INTEGER,
  platform TEXT,
  delay_min INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ts_trip ON trip_stops(trip_id, seq);
CREATE INDEX IF NOT EXISTS idx_ts_station ON trip_stops(station_id, planned_dep);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  minutes INTEGER,
  comment TEXT,
  location_ok INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unconfirmed'
    CHECK (status IN ('unconfirmed','confirmed','disputed','rejected','removed')),
  locked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_trip ON reports(trip_id, created_at);

CREATE TABLE IF NOT EXISTS report_locations (
  report_id INTEGER PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS report_votes (
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value IN (1,-1)),
  location_ok INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (report_id, user_id)
);

CREATE TABLE IF NOT EXISTS content_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (report_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS station_hits (
  station_id INTEGER PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
  n INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wagon_reports (
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wagons INTEGER NOT NULL CHECK (wagons BETWEEN 1 AND 30),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('station','route')),
  from_station_id INTEGER NOT NULL REFERENCES stations(id),
  to_station_id INTEGER REFERENCES stations(id),
  UNIQUE (user_id, kind, from_station_id, to_station_id)
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'premium',
  provider TEXT NOT NULL,
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_events(bucket, created_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
