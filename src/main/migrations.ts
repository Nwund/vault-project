// ===============================
// File: src/main/migrations.ts
// ===============================
import type Database from 'better-sqlite3'
import { getCanonicalCategory } from './services/ai-intelligence/canonical-tags'

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
  },

  // v6: Performance indexes for sorting and filtering
  {
    id: 6,
    up: (db) => {
      db.exec(`
        -- Indexes for common sort operations
        CREATE INDEX IF NOT EXISTS idx_media_addedAt ON media(addedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_media_size ON media(size DESC);
        CREATE INDEX IF NOT EXISTS idx_media_durationSec ON media(durationSec DESC);

        -- Composite index for type + addedAt (common filter + sort)
        CREATE INDEX IF NOT EXISTS idx_media_type_addedAt ON media(type, addedAt DESC);

        -- Index for media_tags lookups
        CREATE INDEX IF NOT EXISTS idx_media_tags_tagId ON media_tags(tagId);
      `)
    }
  },

  // v7: Caption/Meme system - store captions per media
  {
    id: 7,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_captions (
          id TEXT PRIMARY KEY,
          mediaId TEXT NOT NULL,
          topText TEXT,
          bottomText TEXT,
          presetId TEXT NOT NULL DEFAULT 'default',
          customStyle TEXT,
          createdAt REAL NOT NULL,
          updatedAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_media_captions_mediaId ON media_captions(mediaId);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_media_captions_unique ON media_captions(mediaId);

        -- Example captions table for inspiration/templates
        CREATE TABLE IF NOT EXISTS caption_templates (
          id TEXT PRIMARY KEY,
          topText TEXT,
          bottomText TEXT,
          category TEXT,
          createdAt REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_caption_templates_category ON caption_templates(category);
      `)
    }
  },

  // v8: AI Intelligence system - processing queue and analysis results
  {
    id: 8,
    up: (db) => {
      db.exec(`
        -- AI processing queue: tracks which files need processing
        CREATE TABLE IF NOT EXISTS ai_processing_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          priority INTEGER NOT NULL DEFAULT 0,
          tier1_done INTEGER NOT NULL DEFAULT 0,
          tier2_needed INTEGER NOT NULL DEFAULT 0,
          tier2_done INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT,
          completed_at TEXT,
          UNIQUE(media_id)
        );

        -- AI analysis results: staged for review before applying
        CREATE TABLE IF NOT EXISTS ai_analysis_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_id TEXT NOT NULL,
          nsfw_category TEXT,
          nsfw_confidence REAL,
          tier1_raw_tags TEXT,
          suggested_title TEXT,
          description TEXT,
          tier2_extra_tags TEXT,
          attributes TEXT,
          matched_tags TEXT,
          new_tag_suggestions TEXT,
          review_status TEXT NOT NULL DEFAULT 'pending',
          approved_tag_ids TEXT,
          approved_title TEXT,
          reviewed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(media_id)
        );

        CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_processing_queue(status, priority DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_results_review ON ai_analysis_results(review_status);
      `)
    }
  },

  // v9: Smart Playlists - auto-updating playlists based on rules
  {
    id: 9,
    up: (db) => {
      db.exec(`
        -- Add smart playlist columns to playlists table
        ALTER TABLE playlists ADD COLUMN isSmart INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE playlists ADD COLUMN rulesJson TEXT;
        ALTER TABLE playlists ADD COLUMN lastRefreshed REAL;

        -- Index for finding smart playlists quickly
        CREATE INDEX IF NOT EXISTS idx_playlists_smart ON playlists(isSmart);
      `)
    }
  },

  // v10: Additional performance indexes and cleanup
  {
    id: 10,
    up: (db) => {
      db.exec(`
        -- Index for duplicate detection by hash
        CREATE INDEX IF NOT EXISTS idx_media_hashSha256 ON media(hashSha256);

        -- Index for dimension-based filtering
        CREATE INDEX IF NOT EXISTS idx_media_dimensions ON media(width, height);

        -- Index for combined type+rating queries (favorites by type)
        CREATE INDEX IF NOT EXISTS idx_media_stats_mediaId ON media_stats(mediaId);

        -- Optimize media_tags for tag-based lookups
        CREATE INDEX IF NOT EXISTS idx_media_tags_mediaId ON media_tags(mediaId);
      `)
    }
  },

  // v11: AI rename suggestions — Tier 2 ports analyzer.py "suggested_filename" output
  // so the user can accept/reject a rename for gibberish filenames in the review queue.
  {
    id: 11,
    up: (db) => {
      // Column may already exist if a prior dev run partially applied — guard with PRAGMA.
      const cols = db.prepare(`PRAGMA table_info(ai_analysis_results)`).all() as Array<{ name: string }>
      const has = (n: string) => cols.some((c) => c.name === n)
      if (!has('suggested_filename')) {
        db.exec(`ALTER TABLE ai_analysis_results ADD COLUMN suggested_filename TEXT;`)
      }
      if (!has('rich_tags')) {
        db.exec(`ALTER TABLE ai_analysis_results ADD COLUMN rich_tags TEXT;`)
      }
    }
  },

  // v12: AI confidence calibration. Tracks per-(tag, source) rolling stats so
  // we can blend new Tier-2 predictions toward what's been historically true
  // for a given tag, AND scale by how often the user has approved/rejected it.
  // Mirrors content_analyzer/analyzer.py:LearningDatabase.confidence_history +
  // correction_history, but keyed by tag-name (not category).
  {
    id: 12,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_tag_calibration (
          tag_name        TEXT NOT NULL,
          source          TEXT NOT NULL,
          sample_count    INTEGER NOT NULL DEFAULT 0,
          sum_confidence  REAL NOT NULL DEFAULT 0,
          approved_count  INTEGER NOT NULL DEFAULT 0,
          rejected_count  INTEGER NOT NULL DEFAULT 0,
          last_seen       TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (tag_name, source)
        );
        CREATE INDEX IF NOT EXISTS idx_ai_calib_seen ON ai_tag_calibration(last_seen);
      `)
    }
  },

  // v13: media.title — used by AI Review's "approve with edited title" path
  // (processing-queue.ts:approveEdited) and various display surfaces. Was
  // never declared in v1 schema even though writes to it existed; queries
  // failed silently with `no such column: title`. Idempotent guard.
  {
    id: 13,
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'title')) {
        db.exec(`ALTER TABLE media ADD COLUMN title TEXT;`)
      }
    }
  },

  // v14: tags.color + tags.category. Tier3TagMatcher.createNewTags writes
  // INSERT INTO tags (name, color), and import-service writes
  // INSERT INTO tags (id, name, color, category). Neither column existed in
  // v1's CREATE TABLE — every AI-driven tag creation has been silently
  // throwing `no such column: color`, blocking auto-apply entirely.
  // Idempotent guards.
  {
    id: 14,
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(tags)`).all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'color')) {
        db.exec(`ALTER TABLE tags ADD COLUMN color TEXT;`)
      }
      if (!cols.some((c) => c.name === 'category')) {
        db.exec(`ALTER TABLE tags ADD COLUMN category TEXT;`)
      }
    }
  },

  // v15: backfill tags.category for rows where it's still NULL using the
  // canonical-tags vocabulary. v14 added the column but didn't populate it,
  // and Tier 3 only just started writing categories on new rows — this catches
  // every tag the user already has so the categorized AI Review pane and
  // tag-bar grouping work for legacy data too.
  {
    id: 15,
    up: (db) => {
      const rows = db.prepare(
        `SELECT id, name FROM tags WHERE category IS NULL OR category = ''`
      ).all() as Array<{ id: string; name: string }>

      const update = db.prepare(`UPDATE tags SET category = ? WHERE id = ?`)
      let categorized = 0
      const tx = db.transaction((rs: typeof rows) => {
        for (const r of rs) {
          const cat = getCanonicalCategory(r.name)
          if (cat) {
            update.run(cat, r.id)
            categorized++
          }
        }
      })
      tx(rows)
      console.log(`[Migration v15] Categorized ${categorized}/${rows.length} legacy tag rows`)
    }
  },

  // v16: rejection_history JSON column on ai_analysis_results. Each entry
  // captures one full reject() call as { rejectedAt, prevTitle, prevDesc,
  // prevTags } so subsequent re-analysis passes can tell Tier 2 "the user
  // already saw and rejected these directions — try something different".
  // Powers the rejection-feedback loop for task #9.
  {
    id: 16,
    up: (db) => {
      try {
        db.exec(`ALTER TABLE ai_analysis_results ADD COLUMN rejection_history TEXT`)
        console.log('[Migration v16] Added rejection_history TEXT column to ai_analysis_results')
      } catch (e: any) {
        if (!String(e?.message ?? '').includes('duplicate column')) throw e
      }
    }
  },
  {
    id: 17,
    up: (db) => {
      // SFace face recognition tables. face_embeddings stores the
      // 128-D embedding per face detection (one per face per video).
      // face_clusters groups embeddings into "performer" identities;
      // the user can name a cluster and the queue will then emit
      // performer:NAME tags for new media containing that face.
      db.exec(`
        CREATE TABLE IF NOT EXISTS face_clusters (
          id TEXT PRIMARY KEY,
          name TEXT,
          centroid_b64 TEXT NOT NULL,
          sample_count INTEGER NOT NULL DEFAULT 0,
          representative_media_id TEXT,
          representative_bbox TEXT,
          created_at REAL NOT NULL,
          updated_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS face_embeddings (
          id TEXT PRIMARY KEY,
          media_id TEXT NOT NULL,
          cluster_id TEXT,
          frame_idx INTEGER NOT NULL,
          bbox TEXT NOT NULL,
          embedding_b64 TEXT NOT NULL,
          detection_score REAL NOT NULL,
          created_at REAL NOT NULL,
          FOREIGN KEY (cluster_id) REFERENCES face_clusters(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_face_emb_media ON face_embeddings(media_id);
        CREATE INDEX IF NOT EXISTS idx_face_emb_cluster ON face_embeddings(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_face_clusters_name ON face_clusters(name) WHERE name IS NOT NULL;
      `)
      console.log('[Migration v17] Added face_clusters + face_embeddings tables for SFace recognition')
    }
  },
  {
    id: 18,
    up: (db) => {
      // Person ReID body embeddings. Each row is a body crop + 768-D
      // embedding extracted from a MoveNet pose detection. The
      // face_cluster_id is populated when a body and face co-occur in
      // the same frame — letting body crops "inherit" the performer
      // identity from the face cluster they appear with. Future:
      // standalone body clustering for face-occluded videos.
      db.exec(`
        CREATE TABLE IF NOT EXISTS body_embeddings (
          id TEXT PRIMARY KEY,
          media_id TEXT NOT NULL,
          face_cluster_id TEXT,
          frame_idx INTEGER NOT NULL,
          bbox TEXT NOT NULL,
          embedding_b64 TEXT NOT NULL,
          detection_score REAL NOT NULL,
          created_at REAL NOT NULL,
          FOREIGN KEY (face_cluster_id) REFERENCES face_clusters(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_body_emb_media ON body_embeddings(media_id);
        CREATE INDEX IF NOT EXISTS idx_body_emb_face_cluster ON body_embeddings(face_cluster_id);
      `)
      console.log('[Migration v18] Added body_embeddings table for Person ReID')
    }
  },

  {
    id: 19,
    up: (db) => {
      // Multi-frame video fingerprint. Stores a JSON array of N hex pHashes
      // sampled across a video's middle 80%. Catches re-encodes where the
      // single-frame phash above misses because the keyframe shifted. The
      // existing `phash` column stays for image/thumb aHash (cheap, single-
      // shot, used for the AI dedup mode).
      const cols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!cols.find((c) => c.name === 'multi_phash')) {
        db.exec(`ALTER TABLE media ADD COLUMN multi_phash TEXT;`)
        console.log('[Migration v19] Added media.multi_phash for multi-frame dedup')
      }
    }
  },

  {
    id: 20,
    up: (db) => {
      // Repair migration — fills in columns that earlier `CREATE TABLE IF
      // NOT EXISTS` statements would have set, but which are missing from
      // databases whose tables predated those migrations. The user
      // reported "ai:review-list" failing with "no such column:
      // ar.review_status"; this restores it (plus the other columns from
      // v8 + downstream additions) without touching existing rows.
      const cols = db.prepare(`PRAGMA table_info(ai_analysis_results)`).all() as Array<{ name: string }>
      const has = (name: string) => cols.some((c) => c.name === name)
      const addCol = (name: string, def: string) => {
        if (!has(name)) {
          db.exec(`ALTER TABLE ai_analysis_results ADD COLUMN ${name} ${def};`)
          console.log(`[Migration v20] Added ai_analysis_results.${name}`)
        }
      }
      // Only run when the table itself exists — fresh DBs already have
      // these from the v8 CREATE TABLE.
      if (cols.length > 0) {
        addCol('review_status', `TEXT NOT NULL DEFAULT 'pending'`)
        addCol('approved_tag_ids', `TEXT`)
        addCol('approved_title', `TEXT`)
        addCol('reviewed_at', `TEXT`)
        addCol('rich_tags', `TEXT`)
        addCol('rejection_history', `TEXT`)
        addCol('suggested_filename', `TEXT`)
        // Older DBs may also be missing the index — IF NOT EXISTS makes
        // this safe to re-run.
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_results_review ON ai_analysis_results(review_status);`)
      }
    }
  },

  {
    id: 21,
    up: (db) => {
      // Persist whisper transcripts + create an FTS5 search index over
      // them. Lets the user find videos by dialogue: "search for 'step
      // sister'" returns every video where that phrase was spoken.
      // FTS5 is built into SQLite — no extension load needed.
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_transcripts (
          media_id TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          language TEXT,
          source TEXT NOT NULL DEFAULT 'whisper',  -- 'whisper' or 'subtitle' or 'manual'
          created_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS media_transcripts_fts USING fts5(
          text,
          content='media_transcripts',
          content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 1'
        );

        -- Keep FTS in sync via triggers.
        CREATE TRIGGER IF NOT EXISTS media_transcripts_ai AFTER INSERT ON media_transcripts BEGIN
          INSERT INTO media_transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
        END;
        CREATE TRIGGER IF NOT EXISTS media_transcripts_ad AFTER DELETE ON media_transcripts BEGIN
          INSERT INTO media_transcripts_fts(media_transcripts_fts, rowid, text) VALUES('delete', old.rowid, old.text);
        END;
        CREATE TRIGGER IF NOT EXISTS media_transcripts_au AFTER UPDATE ON media_transcripts BEGIN
          INSERT INTO media_transcripts_fts(media_transcripts_fts, rowid, text) VALUES('delete', old.rowid, old.text);
          INSERT INTO media_transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
        END;
      `)
      console.log('[Migration v21] Added media_transcripts + FTS5 index')
    }
  },

  {
    id: 22,
    up: (db) => {
      // Persist CLIP image embeddings per media. Enables natural-
      // language search ("find beach scenes", "POV close-up") by
      // encoding the query string via CLIP's text encoder and cosine-
      // matching against the stored image embeddings.
      //
      // Embedding stored as base64'd Float32 — keeps the table self-
      // contained and column type uniform. ViT-B/32 → 512-D,
      // ViT-L/14 → 768-D — schema doesn't care, the lookup checks
      // dim at compare time.
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_clip_embeddings (
          media_id TEXT PRIMARY KEY,
          embedding_b64 TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT 'unknown',
          created_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_clip_emb_model ON media_clip_embeddings(model);
      `)
      console.log('[Migration v22] Added media_clip_embeddings table')
    }
  },

  {
    id: 23,
    up: (db) => {
      // Whisparr-style performer watchlist (#56). User flags
      // performers they want to follow; a background poller hits
      // Browse sources (TpDB / Reddit / Bluesky / RedGifs / boorus)
      // looking for new uploads. Hits land in performer_watchlist_hits
      // as "pending" entries the user can approve/dismiss from the
      // Performers tab.
      //
      // Design notes:
      //   - performer_name is the lowercase canonical name (matches
      //     the `performer:NAME` tag the rest of Vault uses).
      //   - sources is JSON array of source names to poll for this
      //     performer (so the user can opt-out individual sources
      //     per performer — useful for AI-art-only performers).
      //   - last_polled_at / next_poll_at give the scheduler a way
      //     to stagger polls instead of hammering all sources at once.
      db.exec(`
        CREATE TABLE IF NOT EXISTS performer_watchlist (
          performer_name TEXT PRIMARY KEY,
          face_cluster_id TEXT,                              -- when linked to an existing SFace cluster
          sources TEXT NOT NULL DEFAULT '[]',                -- JSON array of source ids
          enabled INTEGER NOT NULL DEFAULT 1,
          last_polled_at REAL,
          next_poll_at REAL,
          poll_interval_hours INTEGER NOT NULL DEFAULT 24,
          added_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_watchlist_next_poll
          ON performer_watchlist(next_poll_at)
          WHERE enabled = 1;

        CREATE TABLE IF NOT EXISTS performer_watchlist_hits (
          id TEXT PRIMARY KEY,
          performer_name TEXT NOT NULL,
          source_name TEXT NOT NULL,                          -- 'tpdb' / 'reddit' / 'bluesky' / etc
          source_id TEXT,                                     -- the upstream item id
          url TEXT NOT NULL,
          title TEXT,
          thumb_url TEXT,
          released_at REAL,
          discovered_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          status TEXT NOT NULL DEFAULT 'pending',             -- 'pending' / 'queued' / 'dismissed' / 'downloaded'
          notes TEXT,
          FOREIGN KEY (performer_name) REFERENCES performer_watchlist(performer_name) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_watchlist_hits_performer
          ON performer_watchlist_hits(performer_name);
        CREATE INDEX IF NOT EXISTS idx_watchlist_hits_status
          ON performer_watchlist_hits(status, discovered_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_hits_dedup
          ON performer_watchlist_hits(performer_name, source_name, source_id);
      `)
      console.log('[Migration v23] Added performer_watchlist + performer_watchlist_hits')
    }
  },

  {
    id: 24,
    up: (db) => {
      // Chromaprint audio fingerprint column on media. Used by the
      // visualDuplicates:cp* IPC family to detect re-encodes that share
      // an audio track but differ visually (different aspect crop /
      // watermark / re-encode codec). Stored as a JSON envelope so we
      // can carry the duration alongside the hash:
      //   {"d": 234.56, "f": "<base64-chromaprint>"}
      // chromaprintSimilarity in chromaprint-fingerprint.ts handles
      // the bit-distance scoring directly on the .f payload.
      const cols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!cols.find((c) => c.name === 'chromaprint')) {
        db.exec(`ALTER TABLE media ADD COLUMN chromaprint TEXT;`)
        console.log('[Migration v24] Added media.chromaprint for audio-fingerprint dedup')
      }
    }
  },

  {
    id: 25,
    up: (db) => {
      // Persistent trash / recycle bin with 30-day retention. Soft-deletes
      // land here (in addition to the in-memory undo stack which only
      // holds 10 items and is lost on restart). Settings UI lists
      // everything in here, lets the user restore by id, and a boot-time
      // task purges entries older than 30 days.
      //
      // restoration_data is the full JSON envelope needed to round-trip
      // a restore: every media row field + tag-name array. We don't FK
      // to media because the media row is deleted at trash-time; the
      // trash entry is the sole record until restored or auto-purged.
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_trash (
          id TEXT PRIMARY KEY,
          original_path TEXT NOT NULL,
          filename TEXT NOT NULL,
          type TEXT NOT NULL,
          size_bytes INTEGER,
          duration_sec REAL,
          thumb_path TEXT,
          deleted_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          purge_at REAL NOT NULL,
          restoration_data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trash_purge_at ON media_trash(purge_at);
        CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON media_trash(deleted_at DESC);
      `)
      console.log('[Migration v25] Added media_trash for persistent recycle bin')
    }
  },

  {
    id: 26,
    up: (db) => {
      // #155 Stacks / versions — group originals + derivative edits
      // (PMV cuts, color grades, re-encodes) under a single grid card.
      // media.stack_id is the parent media id; stack_role indicates
      // 'original' vs 'edit' vs 'alt'. Nullable so unstacked media is
      // unaffected. Index by stack_id for the group-fetch query.
      const cols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!cols.find((c) => c.name === 'stack_id')) {
        db.exec(`ALTER TABLE media ADD COLUMN stack_id TEXT;`)
      }
      if (!cols.find((c) => c.name === 'stack_role')) {
        db.exec(`ALTER TABLE media ADD COLUMN stack_role TEXT;`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_media_stack_id ON media(stack_id);`)
      console.log('[Migration v26] Added media.stack_id + stack_role for #155 stacks')
    }
  },

  {
    id: 27,
    up: (db) => {
      // #156 Relationships graph — explicit parent/child/alt links
      // between media items. Distinct from #155 stacks (which group
      // versions of the same clip) — relationships connect DIFFERENT
      // clips that happen to be related (e.g. scenes from the same
      // shoot, paired performer roles, sequel-to).
      //
      // kind values:
      //   'parent'      — target is the parent of source
      //   'child'       — target is the child / derivative of source
      //   'alternate'   — source ↔ target are alternate cuts of same
      //   'companion'   — paired (e.g. POV view of the same scene)
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_relationships (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          notes TEXT,
          created_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          UNIQUE(source_id, target_id, kind)
        );
        CREATE INDEX IF NOT EXISTS idx_relationships_source ON media_relationships(source_id);
        CREATE INDEX IF NOT EXISTS idx_relationships_target ON media_relationships(target_id);
      `)
      console.log('[Migration v27] Added media_relationships for #156 relationships graph')
    }
  },

  {
    id: 28,
    up: (db) => {
      // #154 Collections with cover art + ordering. Upgrades the
      // existing tag-based "collection" concept to first-class
      // entities with custom posters + manual ordering. Distinct
      // from playlists (which are sequence-of-media for playback);
      // collections are albums / box-sets for organization.
      db.exec(`
        CREATE TABLE IF NOT EXISTS collections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          cover_path TEXT,
          color TEXT,
          position INTEGER NOT NULL DEFAULT 0,
          parent_id TEXT,
          created_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (parent_id) REFERENCES collections(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);
        CREATE INDEX IF NOT EXISTS idx_collections_position ON collections(position);

        CREATE TABLE IF NOT EXISTS collection_members (
          collection_id TEXT NOT NULL,
          media_id TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          added_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (collection_id, media_id),
          FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_collection_members_media ON collection_members(media_id);
      `)
      console.log('[Migration v28] Added collections + collection_members for #154')
    }
  },

  {
    id: 29,
    up: (db) => {
      // #164 Loudness-normalized playback. Caches the integrated LUFS
      // measurement per video so subsequent loads can apply a GainNode
      // offset to hit -16 LUFS without re-measuring (ffmpeg loudnorm
      // takes 5-30s per video). NULL = unmeasured; -70 = silence.
      const cols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!cols.find((c) => c.name === 'lufs_integrated')) {
        db.exec(`ALTER TABLE media ADD COLUMN lufs_integrated REAL;`)
        console.log('[Migration v29] Added media.lufs_integrated for #164 loudness normalization')
      }
    }
  },

  {
    id: 30,
    up: (db) => {
      // #110 MD5 column for source-side dedup. media:allHashes already
      // queries `md5` but the column never existed — adding it now +
      // an idx for fast IN-clause lookups when the Browse tile-render
      // checks "is this post already in my library?".
      const cols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!cols.find((c) => c.name === 'md5')) {
        db.exec(`ALTER TABLE media ADD COLUMN md5 TEXT;`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_media_md5 ON media(md5) WHERE md5 IS NOT NULL;`)
        console.log('[Migration v30] Added media.md5 + idx_media_md5 for #110 source-side dedup')
      }
    }
  },

  {
    id: 31,
    up: (db) => {
      // #208 Browse-side phash cache. Stores the aHash of every
      // remote thumbnail URL we've ever rendered in Browse so the
      // near-dup badge becomes a single Hamming-distance lookup at
      // render time instead of N fresh HTTP fetches. Worker fills
      // this table in the background; rows are keyed by URL.
      db.exec(`
        CREATE TABLE IF NOT EXISTS browse_phash_cache (
          url TEXT PRIMARY KEY,
          phash TEXT NOT NULL,
          fetched_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_browse_phash_cache_phash ON browse_phash_cache(phash);
      `)
      console.log('[Migration v31] Added browse_phash_cache for #208 near-dup badge')
    }
  },

  {
    id: 32,
    up: (db) => {
      // #206 Saved searches / pinned filters table — promotes the
      // PinnedFiltersBar from localStorage to the catalog so chips
      // ride along with the existing mobile-sync replication and
      // survive a reinstall. query_json is the FilterSnapshot blob
      // the renderer already serializes; position drives chip order.
      db.exec(`
        CREATE TABLE IF NOT EXISTS saved_searches (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          query_json TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_saved_searches_position ON saved_searches(position);
      `)
      console.log('[Migration v32] Added saved_searches for #206 pinned filter sync')
    }
  },

  {
    id: 33,
    up: (db) => {
      // #101 Saved Subscriptions — Hydrus-style "this query, this
      // source, re-fetch on a schedule" with last-seen tracking so
      // only NEW posts surface in the inbox.
      //
      //   subscriptions       one pinned (source, query) tuple
      //   subscription_seen   per-subscription post_id high-water mark
      //   subscription_inbox  newly-discovered posts the user hasn't
      //                       dismissed yet (id, thumb url, source url)
      db.exec(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          source TEXT NOT NULL,
          query TEXT NOT NULL,
          interval_minutes INTEGER NOT NULL DEFAULT 360,
          last_run_at INTEGER,
          last_error TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS subscription_inbox (
          id TEXT PRIMARY KEY,
          subscription_id TEXT NOT NULL,
          post_id TEXT NOT NULL,
          thumb_url TEXT,
          full_url TEXT,
          source_page_url TEXT,
          discovered_at INTEGER NOT NULL,
          dismissed_at INTEGER,
          saved_at INTEGER,
          UNIQUE (subscription_id, post_id)
        );
        CREATE INDEX IF NOT EXISTS idx_subscription_inbox_sub_discovered
          ON subscription_inbox(subscription_id, discovered_at DESC);
        CREATE INDEX IF NOT EXISTS idx_subscription_inbox_pending
          ON subscription_inbox(dismissed_at) WHERE dismissed_at IS NULL;
      `)
      console.log('[Migration v33] Added subscriptions + subscription_inbox for #101')
    }
  },

  {
    id: 34,
    up: (db) => {
      // #195 Multi-user profiles. Profiles share the underlying media
      // + AI tags but maintain their own watch history, ratings, and
      // (future) collections. Phase 1 = profiles table + active-profile
      // tracking via settings; per-user scoping of watch_sessions follows.
      db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT,
          avatar_path TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)
      // Seed a default profile so existing installs still have one
      // "current user" the renderer can attach state to.
      const existing = db.prepare(`SELECT COUNT(*) AS c FROM profiles`).get() as { c: number }
      if (existing.c === 0) {
        const now = Date.now()
        db.prepare(`
          INSERT INTO profiles (id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('default', 'Default', '#7c3aed', now, now)
      }
      // Add profile_id to watch_sessions if missing (so each session
      // remembers which profile recorded it).
      const cols = db.prepare(`PRAGMA table_info(watch_sessions)`).all() as Array<{ name: string }>
      if (!cols.find((c) => c.name === 'profile_id')) {
        db.exec(`ALTER TABLE watch_sessions ADD COLUMN profile_id TEXT;`)
        db.exec(`UPDATE watch_sessions SET profile_id = 'default' WHERE profile_id IS NULL;`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_watch_sessions_profile ON watch_sessions(profile_id);`)
      }
      console.log('[Migration v34] Added profiles + watch_sessions.profile_id for #195')
    }
  },

  {
    id: 35,
    up: (db) => {
      // #106 Stash-style local performers database. Holds canonical
      // performer metadata + cross-source ids (StashDB, ThePornDB,
      // FansDB) + a JSON aliases array for tag normalization. Headshot
      // is a local cached image path (downloaded from whichever source
      // first matched the performer).
      db.exec(`
        CREATE TABLE IF NOT EXISTS performers_db (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          aliases TEXT,         -- JSON array of strings
          gender TEXT,
          country TEXT,
          ethnicity TEXT,
          birthdate TEXT,       -- ISO date
          bio TEXT,
          headshot_path TEXT,
          stashdb_id TEXT,
          tpdb_id TEXT,
          fansdb_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_performers_db_name ON performers_db(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_performers_db_stashdb ON performers_db(stashdb_id) WHERE stashdb_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_performers_db_tpdb ON performers_db(tpdb_id) WHERE tpdb_id IS NOT NULL;
      `)
      console.log('[Migration v35] Added performers_db for #106 Stash-style performer database')
    }
  },
  {
    // #348 + #363 — edging-session log and per-media denial cooldown.
    id: 36,
    up: (db) => {
      // Add denialUntilTs to media_stats so favorited items can carry
      // a self-imposed cooldown timestamp. NULL = no cooldown.
      const cols = db.prepare(`PRAGMA table_info(media_stats)`).all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'denialUntilTs')) {
        db.exec(`ALTER TABLE media_stats ADD COLUMN denialUntilTs REAL;`)
      }
      // Edging session log: one row per session (whether climaxed or
      // denied). XP is summed externally for leaderboards / streaks.
      db.exec(`
        CREATE TABLE IF NOT EXISTS edging_sessions (
          id TEXT PRIMARY KEY,
          startedAt REAL NOT NULL,
          endedAt REAL,
          durationSec INTEGER,
          climaxed INTEGER NOT NULL DEFAULT 0,
          xpEarned INTEGER NOT NULL DEFAULT 0,
          notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_edging_started ON edging_sessions(startedAt);
        CREATE INDEX IF NOT EXISTS idx_edging_climaxed ON edging_sessions(climaxed);
      `)
      console.log('[Migration v36] Added media_stats.denialUntilTs + edging_sessions for #348/#363')
    }
  },
  {
    // #290 D-66 — Stash-style scene markers. Per-media timestamp
    // bookmarks the user creates with M-key during playback.
    id: 37,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scene_markers (
          id TEXT PRIMARY KEY,
          mediaId TEXT NOT NULL,
          timestampSec REAL NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          color TEXT,
          createdAt REAL NOT NULL,
          FOREIGN KEY (mediaId) REFERENCES media(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_scene_markers_media ON scene_markers(mediaId, timestampSec);
      `)
      console.log('[Migration v37] Added scene_markers table for #290')
    }
  },
  {
    // #294 D-70 — Apple Photos "Feature less" suppression. Boolean flag
    // on media_stats; recommender (daily mix, suggestions, smart play-
    // lists) weights these down or excludes them outright when true.
    id: 38,
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(media_stats)`).all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'featureLess')) {
        db.exec(`ALTER TABLE media_stats ADD COLUMN featureLess INTEGER NOT NULL DEFAULT 0;`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_media_stats_featureLess ON media_stats(featureLess) WHERE featureLess = 1;`)
      console.log('[Migration v38] Added media_stats.featureLess for #294')
    }
  },
  {
    // #380 H-156 — per-segment transcript storage for phrase-triggered
    // supercut compiler. Whisper VTT segments persist alongside the
    // flat text so we can search "find all moments where X is said"
    // and slice the source videos at the exact timestamps.
    id: 39,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_transcript_segments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_id TEXT NOT NULL,
          idx INTEGER NOT NULL,
          start_sec REAL NOT NULL,
          end_sec REAL NOT NULL,
          text TEXT NOT NULL,
          FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_transcript_seg_media ON media_transcript_segments(media_id);
        CREATE VIRTUAL TABLE IF NOT EXISTS media_transcript_segments_fts USING fts5(
          text, media_id UNINDEXED, idx UNINDEXED,
          content='media_transcript_segments',
          content_rowid='id',
          tokenize='unicode61 remove_diacritics 1'
        );
        CREATE TRIGGER IF NOT EXISTS mts_ai AFTER INSERT ON media_transcript_segments BEGIN
          INSERT INTO media_transcript_segments_fts(rowid, text, media_id, idx) VALUES (new.id, new.text, new.media_id, new.idx);
        END;
        CREATE TRIGGER IF NOT EXISTS mts_ad AFTER DELETE ON media_transcript_segments BEGIN
          INSERT INTO media_transcript_segments_fts(media_transcript_segments_fts, rowid, text, media_id, idx) VALUES('delete', old.id, old.text, old.media_id, old.idx);
        END;
      `)
      console.log('[Migration v39] Added media_transcript_segments + FTS5 for #380')
    }
  },
  {
    // #299 D-75 — Stash-style Studios entity. Studios are parent
    // groupings of performers (Brazzers / Vixen / Adult Time / etc).
    // Each studio has a name, optional logo path, optional parent
    // company. Performers get an optional studio_id FK; media get an
    // optional studio_id derived from filename or tag matching.
    id: 40,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS studios (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          aliases TEXT,           -- JSON array of alternate names
          logo_path TEXT,
          parent_company TEXT,
          website TEXT,
          url_patterns TEXT,      -- JSON array of regex strings for URL matching
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_studios_name ON studios(name COLLATE NOCASE);
      `)
      // Add studio_id to performers_db (idempotent).
      const cols = db.prepare(`PRAGMA table_info(performers_db)`).all() as Array<{ name: string }>
      if (cols.length > 0 && !cols.some((c) => c.name === 'studio_id')) {
        db.exec(`ALTER TABLE performers_db ADD COLUMN studio_id TEXT REFERENCES studios(id) ON DELETE SET NULL;`)
      }
      // Add studio_id to media (idempotent).
      const mcols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!mcols.some((c) => c.name === 'studio_id')) {
        db.exec(`ALTER TABLE media ADD COLUMN studio_id TEXT REFERENCES studios(id) ON DELETE SET NULL;`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_media_studio ON media(studio_id) WHERE studio_id IS NOT NULL;`)
      }
      console.log('[Migration v40] Added studios + performers_db.studio_id + media.studio_id for #299')
    }
  },
  {
    // #298 D-74 — Linear-style triage inbox for new imports. Each
    // media row gets a `triage_status` column ('pending' | 'active' |
    // 'archived' | 'rejected'). New scans default to 'active' unless
    // settings.triageInboxEnabled = true, in which case they land in
    // 'pending' and the user reviews them in the Triage tab.
    id: 41,
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(media)`).all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'triage_status')) {
        db.exec(`ALTER TABLE media ADD COLUMN triage_status TEXT NOT NULL DEFAULT 'active';`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_media_triage ON media(triage_status) WHERE triage_status != 'active';`)
      }
      console.log('[Migration v41] Added media.triage_status for #298')
    }
  },
  {
    // #317 E-93 — Tag implication import is handled by the existing
    // JSON-file based tag-implications.ts service (#103). Migration
    // intentionally a no-op to bump the schema version monotonically.
    id: 42,
    up: (db) => {
      void db
      console.log('[Migration v42] no-op (tag implications live in JSON store)')
    }
  },
  {
    // #328 F-104 — FTS5 trigram tokenizer for substring search.
    // SQLite 3.40+ ships the trigram tokenizer which enables
    // contains-style matching ("LIKE %xxx%" with index) on the
    // existing media_transcripts text. We add a second FTS index
    // alongside the unicode61 one so callers can pick:
    //   - existing media_transcripts_fts → fast word search
    //   - new media_transcripts_fts_tri → substring search
    id: 43,
    up: (db) => {
      try {
        db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS media_transcripts_fts_tri USING fts5(
            text,
            content='media_transcripts',
            content_rowid='rowid',
            tokenize='trigram'
          );
          -- Backfill from existing transcripts.
          INSERT INTO media_transcripts_fts_tri(rowid, text)
            SELECT rowid, text FROM media_transcripts
            WHERE rowid NOT IN (SELECT rowid FROM media_transcripts_fts_tri);
          -- Keep in sync via triggers (separate from the unicode61 ones).
          CREATE TRIGGER IF NOT EXISTS media_transcripts_tri_ai AFTER INSERT ON media_transcripts BEGIN
            INSERT INTO media_transcripts_fts_tri(rowid, text) VALUES (new.rowid, new.text);
          END;
          CREATE TRIGGER IF NOT EXISTS media_transcripts_tri_ad AFTER DELETE ON media_transcripts BEGIN
            INSERT INTO media_transcripts_fts_tri(media_transcripts_fts_tri, rowid, text) VALUES('delete', old.rowid, old.text);
          END;
          CREATE TRIGGER IF NOT EXISTS media_transcripts_tri_au AFTER UPDATE ON media_transcripts BEGIN
            INSERT INTO media_transcripts_fts_tri(media_transcripts_fts_tri, rowid, text) VALUES('delete', old.rowid, old.text);
            INSERT INTO media_transcripts_fts_tri(rowid, text) VALUES (new.rowid, new.text);
          END;
        `)
        console.log('[Migration v43] Added FTS5 trigram tokenizer index for substring search')
      } catch (err) {
        // SQLite < 3.40 doesn't have trigram — log + carry on, the
        // unicode61 index is still usable for exact-word matches.
        console.warn('[Migration v43] trigram tokenizer unavailable (SQLite version too old?):', err)
      }
    }
  }
]

function getVersion(db: Database.Database): number {
  try {
    const row = db.prepare(`SELECT value FROM meta WHERE key='schema_version' LIMIT 1;`).get() as { value: string } | undefined
    return row ? Number(row.value) : 0
  } catch {
    // Table doesn't exist yet - this is a fresh database
    return 0
  }
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
  // Unconditional schema-drift repair — runs every startup so that
  // databases whose tables predate later CREATE-IF-NOT-EXISTS additions
  // get the missing columns added. Idempotent: each addCol guards on
  // PRAGMA table_info. This is the safety net for cases where a versioned
  // migration was skipped because schema_version had already advanced.
  try { repairAiAnalysisResultsColumns(db) } catch (err) {
    console.warn('[Migrations] Schema-drift repair pass failed (non-fatal):', err)
  }
}

/**
 * Ensure ai_analysis_results has all the columns the application code
 * expects. Each ALTER TABLE only runs when PRAGMA table_info reports
 * the column is missing — safe to call repeatedly.
 */
function repairAiAnalysisResultsColumns(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(ai_analysis_results)`).all() as Array<{ name: string }>
  if (cols.length === 0) return  // table doesn't exist yet — nothing to repair
  const has = (name: string) => cols.some((c) => c.name === name)
  let mutated = false
  const ensure = (name: string, def: string) => {
    if (!has(name)) {
      db.exec(`ALTER TABLE ai_analysis_results ADD COLUMN ${name} ${def};`)
      console.log(`[Schema-repair] Added ai_analysis_results.${name}`)
      mutated = true
    }
  }
  ensure('review_status', `TEXT NOT NULL DEFAULT 'pending'`)
  ensure('approved_tag_ids', `TEXT`)
  ensure('approved_title', `TEXT`)
  ensure('reviewed_at', `TEXT`)
  ensure('rich_tags', `TEXT`)
  ensure('rejection_history', `TEXT`)
  ensure('suggested_filename', `TEXT`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_results_review ON ai_analysis_results(review_status);`)
  // ALWAYS force the connection's schema cache to refresh, even when no
  // ALTER ran this boot. better-sqlite3 caches each Database's view of
  // the schema; if a prior process added the column but didn't refresh
  // the cache before getting recycled, the NEXT boot's primary
  // connection can still throw "no such column: ar.review_status" on
  // queries against it. Touching sqlite_schema + a no-row SELECT
  // forces the parser to re-walk the master table at the connection
  // level. This is the hook that closes the "fresh-conn workaround"
  // class of bug we shipped in v2.6 (see processing-queue.ts:2236).
  try {
    db.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name='ai_analysis_results'`).all()
    db.prepare(`SELECT * FROM ai_analysis_results LIMIT 0`).all()
    if (mutated) console.log('[Schema-repair] Connection schema cache refreshed after ALTERs')
  } catch (err) {
    console.warn('[Schema-repair] schema-refresh dance failed (non-fatal):', err)
  }
}