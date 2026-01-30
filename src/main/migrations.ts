// ===============================
// File: src/main/migrations.ts
// ===============================
import type Database from 'better-sqlite3'

type Migration = { id: number; up: (db: Database.Database) => void }

const migrations: Migration[] = [
  {
    id: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          filename TEXT NOT NULL,
          ext TEXT NOT NULL,
          size INTEGER NOT NULL,
          mtimeMs REAL NOT NULL,
          addedAt REAL NOT NULL,
          durationSec REAL,
          thumbPath TEXT,
          width INTEGER,
          height INTEGER,
          hashSha256 TEXT,
          phash TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);
        CREATE INDEX IF NOT EXISTS idx_media_filename ON media(filename);

        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS media_tags (
          mediaId TEXT NOT NULL,
          tagId TEXT NOT NULL,
          PRIMARY KEY (mediaId, tagId)
        );

        CREATE TABLE IF NOT EXISTS markers (
          id TEXT PRIMARY KEY,
          mediaId TEXT NOT NULL,
          timeSec REAL NOT NULL,
          title TEXT NOT NULL,
          createdAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_markers_media ON markers(mediaId);

        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          priority INTEGER NOT NULL,
          payloadJson TEXT NOT NULL,
          error TEXT,
          createdAt REAL NOT NULL,
          startedAt REAL,
          finishedAt REAL
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority, createdAt);
      `)
    }
  },

  // v2: playlists + stats + daylist + search history
  {
    id: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_stats (
          mediaId TEXT PRIMARY KEY,
          views INTEGER NOT NULL DEFAULT 0,
          lastViewedAt REAL,
          rating INTEGER NOT NULL DEFAULT 0,
          oCount INTEGER NOT NULL DEFAULT 0,
          updatedAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_media_stats_views ON media_stats(views);
        CREATE INDEX IF NOT EXISTS idx_media_stats_rating ON media_stats(rating);
        CREATE INDEX IF NOT EXISTS idx_media_stats_lastViewed ON media_stats(lastViewedAt);

        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          createdAt REAL NOT NULL,
          updatedAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_playlists_updated ON playlists(updatedAt);

        CREATE TABLE IF NOT EXISTS playlist_items (
          id TEXT PRIMARY KEY,
          playlistId TEXT NOT NULL,
          mediaId TEXT NOT NULL,
          position INTEGER NOT NULL,
          addedAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_playlist_items_pid_pos ON playlist_items(playlistId, position);
        CREATE INDEX IF NOT EXISTS idx_playlist_items_media ON playlist_items(mediaId);

        CREATE TABLE IF NOT EXISTS daylists (
          id TEXT PRIMARY KEY,
          dayKey TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          createdAt REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daylist_items (
          id TEXT PRIMARY KEY,
          daylistId TEXT NOT NULL,
          mediaId TEXT NOT NULL,
          position INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_daylist_items_did_pos ON daylist_items(daylistId, position);

        CREATE TABLE IF NOT EXISTS search_history (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL,
          createdAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(createdAt);
      `)
    }
  },

  // v3: AI video analysis storage
  {
    id: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS video_analyses (
          id TEXT PRIMARY KEY,
          mediaId TEXT NOT NULL UNIQUE,
          duration REAL,
          summary TEXT,
          scenesJson TEXT,
          tagsJson TEXT,
          highlightsJson TEXT,
          bestThumbnailTime REAL,
          analyzedAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_video_analyses_media ON video_analyses(mediaId);

        -- Track tag visibility (hidden until has videos)
        ALTER TABLE tags ADD COLUMN isHidden INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE tags ADD COLUMN isAiGenerated INTEGER NOT NULL DEFAULT 0;
      `)
    }
  },

  // v4: Track permanently failed analysis
  {
    id: 4,
    up: (db) => {
      db.exec(`
        ALTER TABLE media ADD COLUMN analyzeError INTEGER NOT NULL DEFAULT 0;
      `)
    }
  },

  // v5: Transcode cache path and loudness peak time
  {
    id: 5,
    up: (db) => {
      db.exec(`
        ALTER TABLE media ADD COLUMN transcodedPath TEXT;
        ALTER TABLE media ADD COLUMN loudnessPeakTime REAL;
      `)
    }
  }
]

function getVersion(db: Database.Database): number {
  const row = db.prepare(`SELECT value FROM meta WHERE key='schema_version' LIMIT 1;`).get() as { value: string } | undefined
  return row ? Number(row.value) : 0
}

function setVersion(db: Database.Database, v: number): void {
  db.prepare(`
    INSERT INTO meta(key, value) VALUES('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value;
  `).run(String(v))
}

export function runMigrations(db: Database.Database): void {
  const current = getVersion(db)
  for (const m of migrations) {
    if (m.id > current) {
      db.transaction(() => {
        m.up(db)
        setVersion(db, m.id)
      })()
    }
  }
}