# Memo — Phase 3

For current progress, deployment status, open decisions and handoff notes, start with [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Quick start
```bash
npm install
cp .env.example .env
npm run dev
```

## Supabase setup — run SQL files in this order
1. `supabase/schema.sql`
2. `supabase/rpc.sql`
3. `supabase/schema-p3.sql`
4. `supabase/schema-srs.sql`

## What's new in Phase 3
- Folders — organise sets into named folders, shown in sidebar
- Pinned sets — pin important sets to the top of home
- Spaced repetition (SM-2) — due cards surface first, intervals grow with correct answers
- Shuffle toggle — randomise card order before each session
- Countdown timer — set 1/3/5/10 min target, turns red under 30s, auto-ends at zero
- Success animations — count-up for sub-100%, card stack + 100% stamp for perfect
- Keyboard shortcuts — Space flip, ← still learning, → got it

## Deploying to Vercel

### Step 1 — GitHub
1. Go to github.com, sign up, click New repository
2. Name it `memo`, set Private, click Create

### Step 2 — Push from Terminal
```bash
git init
git add .
git commit -m "memo phase 3"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/memo.git
git push -u origin main
```
Replace YOUR-USERNAME with your GitHub username.

### Step 3 — Vercel
1. Go to vercel.com, sign up with GitHub
2. Click Add New Project, select your memo repo
3. Vite is auto-detected — no config needed
4. Before deploying, click Environment Variables and add:
   - VITE_SUPABASE_URL = your Supabase project URL
   - VITE_SUPABASE_ANON_KEY = your anon key
5. Click Deploy — live in ~60 seconds

## Design tokens
- Accent: #84cc16 (lime green)
- Font: Inter
- Card flip: vertical rotateX 0.32s cubic-bezier(0.4,0,0.2,1)
- Streak unit: weeks

## Saving reliability update (October 2026)

**Memo production database:** this update was applied on 14 October 2026 as migration `20261014050533_saving_reliability_and_legacy_draft_compatibility`. Existing decks, cards, and progress were verified intact.

**For another existing installation, apply these before deploying this version:**

1. Back up/export the current database using your Supabase backup workflow.
2. Run `supabase/schema-drafts.sql` (creates the draft table if missing).
3. Run `supabase/schema-saving.sql` (rerunnable, transactional migration).
4. Deploy the app, then verify a title-only deck edit, Master Deck session, and resume after refresh with a test deck.

For a new installation, run those two files after the four SQL files listed in Quick start.

The migration preserves existing cards and study records. It adds atomic deck saving, permits Learn and sentence sessions, supports cross-deck sessions, and stores complete draft state. The new frontend requires this migration; if the `save_deck` function is missing, deck edits fail visibly without falling back to deleting/reinserting cards.

Study changes are written to a user-scoped local queue before synchronization. Failed writes survive reload and retry on reconnection/focus and periodically while the app is open. A visible banner reports pending synchronization. Do not clear browser site data while there are unsynced changes. If browser storage is unavailable, the app warns you to keep the tab open. This is recovery for study state, not a fully offline app or concurrent multi-device conflict resolution system.

Completed and partial sessions use the same stable ID through retries and resume. Cards-studied totals count answered cards. Learn batch state, sentence text/feedback, card order, undo, and remaining timer time are recoverable. Starting a different mode prompts before replacing an existing draft.

### Checks

```bash
npm install
npm test
npm run build
```

`npm test` runs isolated store/recovery tests and an embedded PostgreSQL test suite. Tests use synthetic accounts and data; they never connect to the live database. The PostgreSQL setup substitutes a local `auth.uid()` function and uses the engine's built-in UUID generation instead of the Supabase `pgcrypto` extension.

The historical security review still applies to the AI handlers: application-level endpoint authentication is a separate follow-up from these saving fixes.

## Credits

Story word lookups use [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), published by MDBG under the [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license. `public/cedict.txt` is a derived version of that dictionary (tone-marked pinyin, trimmed senses) and is distributed under the same license. To refresh it, download `cedict_1_0_ts_utf-8_mdbg.txt` from MDBG and run `node scripts/build-cedict.mjs <path to that file>`.
