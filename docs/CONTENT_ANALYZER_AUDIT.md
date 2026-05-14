# content_analyzer audit — port targets for Vault

**Source:** `C:\dev\porn_analyzer_backup\content_analyzer\` (Python prior-art tagger, ~125KB analyzer.py + 31KB advanced_features.py).
**Goal of this doc:** identify which heuristics from the prior tool are worth porting into Vault's AI pipeline. Closes task **#19**.

This is a survey, not an implementation plan. Each section ends with a **port verdict** and target Vault file.

---

## TL;DR — what to port

**High value (port these):**
1. **Filename keyword catalog** — 150+ patterns mapping filename substrings to category hints. → `services/ai-intelligence/filename-hints.ts` (file already exists, mostly a stub).
2. **Studio detection** — known-studio name list. → augment title generation in `tier2-vision-llm.ts`.
3. **Multi-frame consensus voting** — explicit agreement scoring across frames. → `processing-queue.ts` Tier 2 aggregation step.
4. **Filename weirdness detection + cleanup patterns** — generate vs clean vs ok decision tree. → `tier2-vision-llm.ts` (already has `isGibberishFilename` stub at line 40 — needs the full pattern set).

**Medium value (port if perf/UX is bothering us):**
5. **Confidence calibration via history** — blend raw Venice confidence with rolling per-category average.
6. **Learning DB schema** — keyword/position/action vocabulary that grows from user corrections.
7. **Duration hints** — clip vs full-scene vs compilation buckets.

**Low value (skip):**
8. **Category priority hierarchy** — Vault uses atomic tags now, not single-category-wins. Vault's model is fundamentally better; the priority concept doesn't translate.
9. **Demographic keyword detection** — Vault's Venice prompt already handles this and the Python list overlaps with our deny-list (e.g. `Redhead`, `Blonde` — Vault has those banned per `canonical-tags.ts`).
10. **Intensity rating** — Vault has measured loudness intensity per curated SOUND (#57). The Python tool's keyword-based intensity is for content categorization, which Vault doesn't surface.
11. **Perceptual hash** — Vault has `services/visual-duplicates-service.ts` already.
12. **Audio analysis / motion intensity** — Vault has frame-extractor's scene detection + ffmpeg integration; functional overlap is already covered.

---

## 1. Filename keyword catalog (HIGH VALUE — port)

**Source:** `analyzer.py:267-309` (`FILENAME_KEYWORDS` dict).
**Size:** ~150 keyword strings across 18 categories.

**Structure:**
```python
FILENAME_KEYWORDS = {
    "Hentai": ["hentai", "anime", "cartoon", "animated", "drawn", "3d render",
               "sfm", "blender", "mlp", "pony", "furry", "rule34", "r34",
               "overwatch", "fortnite", "genshin", "pokemon", ...],
    "Sound-Only": ["asmr", "audio only", "sound only", "no video", ...],
    "Gay": ["gay", "yaoi", "m/m", "bara", "muscle worship", "men.com", ...],
    "Twink": ["twink", "femboy", "sissy", "trap", "crossdress", ...],
    "Bear": ["bear", "chub", "chubby male", "hairy male", "otter", ...],
    "Male-Solo": ["male solo", "solo male", "fleshlight", "jerking off", ...],
    "Trans": ["trans", "shemale", "ladyboy", "tgirl", "futanari", "futa", ...],
    "Lesbian": ["lesbian", "yuri", "f/f", "girl on girl", "tribbing", ...],
    "Gangbang": ["gangbang", "bukakke", "bukkake", "gokkun", "5+", ...],
    "Threesome": ["threesome", "3way", "ffm", "mmf", "mff", ...],
    "Anal": ["anal", "ass fuck", "sodomy", "gape", "atm", "a2m", ...],
    "Blowjob": ["blowjob", "deepthroat", "throat", "cock suck", ...],
    "Cunnilingus": ["pussy lick", "eat out", "face sitting", ...],
    "Creampie": ["creampie", "cream pie", "cum inside", "breeding"],
    "Squirt": ["squirt", "squirting", "gush", "female ejaculation"],
    "BDSM": ["bdsm", "bondage", "dom", "sub", "slave", "whip", "spank", ...],
    "Fetish": ["fetish", "foot", "feet", "piss", "latex", "leather", ...],
    "Public": ["public", "outdoor", "outside", "exhibitionist", "flash"],
    "POV": ["pov", "point of view", "first person"],
    "Cosplay": ["cosplay", "costume", "roleplay", "character"],
    # ... ~20 more entries
}
```

**Why port it:** filename data is FREE signal — already on disk, no API call, no decode. The Python tool uses it as a tier-0 hint that biases the AI's output. Vault currently does some of this in `tier2-vision-llm.ts:isGibberishFilename` but doesn't exploit POSITIVE signal from the filename (only checks if it's garbage).

**How to port:**
- New `services/ai-intelligence/filename-hints.ts` already stubbed. Populate with this catalog adapted to Vault's atomic-tag model (e.g. instead of returning category `"Gangbang"`, return `["gangbang", "group"]`; instead of `"Hentai"` return `["hentai"]`).
- Hook into Tier 2: include the matched filename keywords as a "FILENAME HINTS" block in the user message, telling Venice "filename also suggests: X, Y, Z — use these if visually consistent with the frame, drop if not."
- Hook into Tier 3: on a tag-match miss for a Tier 2 emission, fall back to filename hints before discarding.

**Edits needed in canonical-tags.ts:** spot-check the keyword list against the deny list. Anything in `CAPTIONER_NOISE` should NOT be promoted as a filename hint. (E.g. `redhead` is in DEMOGRAPHIC_KEYWORDS but banned in Vault — drop from the port.)

**Effort:** half a session.

---

## 2. Studio detection (HIGH VALUE — port)

**Source:** `analyzer.py:767-782` (`KNOWN_STUDIOS` list + `detect_studio_from_filename`).

**List:**
```python
KNOWN_STUDIOS = [
    "brazzers", "bangbros", "realitykings", "naughtyamerica", "pornhub",
    "xvideos", "xhamster", "redtube", "youporn", "tube8", "blacked",
    "tushy", "vixen", "deeper", "mofos", "digitalplayground", "wicked",
    "evilangel", "kink", "legalporno", "private", "dorcel", "marc dorcel",
    "fakeagent", "faketaxi", "publicagent", "sexyhub", "teamskeet",
    "girlsway", "sweetsinner", "newsensations", "hardx", "julesjordan",
]
```

**Why port:** title generation. Vault's `regenerateField('title')` could include "from STUDIO" when detected, e.g. "Brazzers — Latina MILF Rides Cock On Kitchen Counter". Studios are also a useful tag dimension users may want to search.

**How to port:**
- Add to `filename-hints.ts` alongside the keyword catalog.
- Surface as a `studio?: string` field on `AnalysisResult`.
- Optionally: add a `studio` tag column in canonical-tags so studios can be filtered like any other tag (with hidden "category: studio" grouping for the Tags page).

**Effort:** trivial — single file edit. Defer the tag-column piece until user asks.

---

## 3. Multi-frame consensus voting (HIGH VALUE — port)

**Source:** `analyzer.py:704-742` (`compute_consensus_category`).

**Algorithm:**
1. Collect category + confidence from every analyzed frame.
2. Vote per category (count + sum confidence).
3. Winner = highest count, tiebreaker = highest summed confidence.
4. Compute agreement = winner_count / total_frames.
5. Adjust final confidence:
   - `agreement >= 0.8` → boost by +0.1
   - `agreement >= 0.6` → keep as-is (avg)
   - `agreement < 0.6` → penalty −0.1 (clamped to 0.3 floor)

**Why port:** Vault's Tier 2 already runs 12 frames but the aggregation is implicit in Venice's response (it sees all 12 and emits one tag list). Adding an explicit consensus pass would:
- Surface low-agreement results as "needs review" (user feedback signal).
- Let Vault track per-tag agreement scores → confidence tiers in the review UI ("12 frames agreed" badge vs "6/12 agreed").
- Provide a foundation for "auto-approve when agreement is unanimous" workflows.

**How to port:**
- In `processing-queue.ts`, after Tier 2 returns, run the same prompt across each frame INDEPENDENTLY (in parallel), then consensus-vote.
- COST: 12× the Venice spend per video. Probably gate behind an "Accuracy Mode" toggle in AI Tools settings.
- Cheaper alternative: ask Venice to ALSO emit per-tag confidence scores in JSON, then process those.

**Effort:** half a session for the cheap version, full session for the parallel-frame version.

---

## 4. Filename weirdness + cleanup (HIGH VALUE — port)

**Source:** `analyzer.py:2329-2419` (`is_filename_weird` + `clean_filename`).

**Detection patterns:**
- Just numbers/single chars: `(1)`, `1`, `001` → needs AI generation
- Random alphanumeric: `a8f3b2c1d4e5` (likely hash/ID) → needs AI generation
- Very short (≤3 chars, not alpha) → needs AI generation
- Mostly non-ASCII (>70% non-English chars) → needs AI generation
- Junk patterns (just clean, don't regenerate):
  - `vid_12345`, `video_12345`, `clip_*` prefixes
  - Date prefixes/suffixes: `2024-01-15`
  - Long number suffixes: `_12345678`
  - `_(1)`, `_copy`, `_final`, `[1]` suffixes

**Cleanup patterns (regex strip-and-titlecase):**
```python
patterns_to_remove = [
    r'[-_]?\d{4}[-_]\d{2}[-_]\d{2}[-_]?\d*',  # dates
    r'[-_]?\d{8,}',                            # long numbers
    r'\s*\(\d+\)',                              # (1)
    r'\s*\[\d+\]',                              # [1]
    r'[-_](copy|final)\d*',                     # _copy, _final
    r'^(vid|video|clip|mov|img)[-_]',           # prefixes
    r'[-_]+(hd|sd|720p|1080p|4k|uhd)[-_]*',    # quality markers
]
```

**Why port:** Vault's `isGibberishFilename` at `tier2-vision-llm.ts:40` decides whether to generate vs preserve, but the patterns are minimal. The Python tool has a more nuanced 3-way decision (`generate` / `clean` / `ok`) and a full cleanup regex set.

**How to port:**
- Augment `isGibberishFilename` in `tier2-vision-llm.ts` with the full pattern catalog.
- Return tuple `(action: 'generate' | 'clean' | 'ok', cleaned?: string)` instead of just boolean.
- For `'clean'` action: skip Venice entirely, just rename. Saves API spend.
- For `'generate'` action: feed Venice with no filename context (current behavior).
- For `'ok'` action: feed Venice the filename as a hint.

**Effort:** trivial — one file edit, ~50 lines.

---

## 5. Confidence calibration via history (MEDIUM VALUE)

**Source:** `analyzer.py:749-760` (`calibrate_confidence`) + `LearningDatabase.get_category_confidence_avg`.

**Algorithm:** blend raw Venice confidence with rolling 100-call average per category:
```python
calibrated = (raw_confidence * 0.7) + (historical_avg * 0.3)
```

**Why port:** if Venice tends to over-confidently emit `bbw` at 0.95 but user rejects 40% of those, we'd want to display calibrated ~0.6 in the review queue — it's a useful "pause and look" signal.

**Why medium-value:** Vault has the rejection feedback loop already (#9). The signal is captured; it's just not surfacing as a confidence calibrator. Worth doing only if user starts complaining about confidence values being misleading.

**Port location:** `processing-queue.ts` after Tier 3 matching. Store rolling per-tag confidence in a new `tag_confidence_history` table (or piggyback the existing learning DB if we add one).

---

## 6. Learning DB pattern (MEDIUM VALUE)

**Source:** `analyzer.py:46-200` (`LearningDatabase` class).

**Schema:**
```json
{
  "category_patterns": {},      // patterns learned per category
  "keyword_associations": {},   // {category: {word: count}}
  "position_vocabulary": {},    // {category: {position: count}}
  "action_vocabulary": {},      // {category: {action: count}}
  "confidence_history": {},     // {category: [last 100 confidences]}
  "correction_history": [],     // [{filename, old_cat, new_cat, reason, ts}]
  "total_analyses": 0,
  "version": 2
}
```

**Behavior:**
- After every successful analysis: extract filename words >2 chars, increment `keyword_associations[final_category][word]`.
- Same for emitted positions, actions.
- Track confidence trends per category (rolling 100).
- On manual correction: log to `correction_history` (capped at 500).
- `get_learned_context(category)` builds a "LEARNED PATTERNS" string injected into Venice prompt — top-5 keywords per top-10 categories, top-3 positions, top-3 actions, last 10 corrections.

**Why port:** task **#42 (Xyrene long-term learning)** is already shipped, but it operates on the user's WATCHED content + Xyrene's reactions. This Python tool's learning is on the TAGGER side — what the user keeps vs rejects in the review queue. Different signal, complementary.

**Why medium-value:** Vault has the rejection feedback loop (#9) — every rejection feeds the rejection_history column. The data is there; just not aggregated into "patterns to feed back to Venice." A future Tier 2 prompt could include a "FROM YOUR CORRECTION HISTORY:" block analogous to the Xyrene brain.

**Port location:** new `services/ai-intelligence/tagger-learning.ts` (mirror Xyrene's brain in shape). Consume rejection_history. Emit a string block injected into the Tier 2 system prompt.

---

## 7. Duration hints (LOW-MEDIUM VALUE)

**Source:** `analyzer.py:580-607` (`get_duration_hints`).

**Buckets:**
- `< 15s` → micro / clip
- `< 60s` → short / clip
- `< 300s` (5 min) → medium
- `< 1200s` (20 min) → long / full scene
- `>= 1200s` → full
- `> 1800s` (30 min) → likely compilation

**Why port:** could bias the Venice prompt — "this is a 35-minute video, probably a compilation; don't try to summarize it as a single scene." Vault currently doesn't tell Venice how long the video is in the prompt.

**Cost:** trivial. One sentence in the system prompt assembled from `media.durationSec`.

**Verdict:** worth doing as a one-liner. Add to `tier2-vision-llm.ts:buildVeniceAnalysisSystemPrompt`.

---

## 8. Category priority hierarchy (SKIP)

**Source:** `analyzer.py:213-260` (`CATEGORY_PRIORITY`).

The Python tool uses a hard hierarchy where one category wins per file (Hentai > Gay > Threesome > Anal > MILF > etc.). Vault uses atomic tags — multiple coexist on a single file. The priority concept doesn't translate.

**Verdict:** skip. The information is already encoded better in Vault's `canonical-tags.ts` deny-lists + Tier 3 matcher.

---

## 9. Demographic keyword detection (SKIP)

**Source:** `analyzer.py:789-810`.

The Python tool emits demographic categories from filename keywords. Vault's Venice prompt already handles demographics (race, body type, age) better than filename guesses, AND `Redhead` / `Blonde` are banned per user preference (`canonical-tags.ts`).

**Verdict:** skip. Anything useful here is already in `FILENAME_KEYWORDS` (item #1).

---

## 10. Intensity rating (SKIP for content; ALREADY HAVE for sounds)

**Source:** `analyzer.py:658-697`.

Keyword-based intensity scoring (softcore / moderate / hardcore / intense / extreme). Useful for content categorization, but Vault doesn't surface a "content intensity" axis — it surfaces tags that imply intensity (e.g. `rough`, `gangbang`, `extreme`).

Vault DOES have measured loudness-based intensity per curated sound (task #57), which is a different thing.

**Verdict:** skip.

---

## 11. Perceptual hash (SKIP — already have)

Vault has `services/visual-duplicates-service.ts` running phash already.

---

## 12. Audio analysis / motion intensity / scene detection (SKIP — overlap)

Vault has `frame-extractor.ts` with ffmpeg `scdet` scene detection + intensity-aware sample picking. The Python tool's audio + motion analysis is duplicative.

---

## Summary of recommended port plan

If/when this gets prioritized:

**Phase 1** (single session): items #1, #2, #4, #7. Pure text/regex work, no API dependencies.
- Populate `services/ai-intelligence/filename-hints.ts` with the 150-keyword catalog (filtered against `canonical-tags` deny lists).
- Add studio detection helper.
- Augment `isGibberishFilename` to a 3-way (generate/clean/ok) decision with cleanup regex.
- Add duration-bucket sentence to Venice prompt.

**Phase 2** (single session): item #3 (consensus voting).
- Add per-frame-vote aggregation in `processing-queue.ts` after Tier 2.
- Surface agreement score in the review queue ("12/12 agreed" or "5/12 agreed — review carefully").

**Phase 3** (deferred until user pain): items #5, #6 (calibration + learning DB).
- Only worth building when rejection patterns become noticeable. The data infrastructure (rejection_history) is already there.

Skip items 8-12 (already handled or doesn't translate).

---

*End of audit.*

---

# Research-driven optimization notes (2026-05-10)

Findings from a research pass after the main audit. Each item shipped, deferred, or noted for future work.

## Shipped this round

### SQLite production PRAGMAs (`db.ts`)
Vault previously set only `journal_mode = WAL`. The research-validated baseline adds:
- `synchronous = NORMAL` — safe with WAL, much faster than FULL.
- `busy_timeout = 5000` — blocks up to 5s on lock instead of throwing SQLITE_BUSY.
- `cache_size = -32000` — 32 MB cache. Hot pages stay in memory.
- `temp_store = MEMORY` — sort buffers in RAM, faster ORDER BY on large queries.
- `foreign_keys = ON` — enforces existing FK constraints on media_tags/media_stats/ai_analysis_results.

Source: phiresky's SQLite perf blog, sqlite.org/wal.html, oneuptime's 2026-02 production guide.

### qwen3-vl per-frame timestamps (`tier2-vision-llm.ts`)
qwen3-vl has explicit text-timestamp alignment for temporal reasoning (per the 2026 Qwen3-VL technical report, arxiv 2511.21631). Vault was sending categorical hints ("EARLY/MIDDLE/LATE"); switched to actual HH:MM:SS + progress % per frame. Lets the model do precise event localization across the 12 frames it sees.

## Deferred (would help but bigger lift)

### XTTS streaming (`voice-client.ts`)
Current path: `synth(text)` calls `/tts`, waits for full WAV buffer, plays. XTTS supports `/tts_stream` with <200ms latency — start playing as bytes arrive. Useful for Watch With Xy + Climax voice overlay where perceived speed matters. Adds an audio queue + MediaSource piece to the renderer. Single session of work when prioritized.

### Voice clone quality reference
XTTS docs recommend **30-60s of varied speech with diverse intonation** for best clone quality. Vault currently uses `xyrene.wav` (single short sample). Future improvement: encourage longer + more varied reference recordings in xyrene-portable's setup flow.

### Scene detection accuracy
Vault uses ffmpeg's `scdet`. Research suggests it misses cuts more than PySceneDetect's HSV-difference detector. PySceneDetect requires Python, so would mean a sidecar. Not worth porting now — `scdet` is "good enough" for the multi-frame picker.

## Investigated, skipped

### Indexes audit
A quick mental pass on Vault's tables suggests existing indexes are reasonable (media.path PK, media_tags composite, ai_analysis_results.media_id). Worth a focused EXPLAIN QUERY PLAN audit later if scale becomes a concern.

### Library blacklist server-side
Already noted as a follow-on in `APP_TSX_SPLIT_PLAN.md`. Would require schema awareness in `db.listMedia` or a post-filter step that recomputes `total`. Not blocking at current scale.
