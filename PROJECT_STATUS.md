# Memo — project handoff

Updated: 22 October 2026. Start here when switching editors or coding assistants.

## Current state

- App: personal flashcards and language-learning tool, built with React, TypeScript, Vite and Zustand; Supabase stores accounts and study data.
- Live app: https://memo-mocha-nine.vercel.app/
- GitHub: https://github.com/moodinfinite/memo
- Last deployed commit: `4856bcd` (22 October, verified live) — **Write it** on flashcards when the definition faces up and the term is Chinese: type or handwrite, Enter checks and flips, a second Enter takes the suggested answer (`writingMatches()` in `src/lib/cjk.ts` compares Chinese characters only and accepts any form listed in the term; on/off saved per device as `memo-flash-write`). Multiple choice and Learn quizzes have speakers on the question and on each Chinese option. Home's finished Daily 10 card turns cyan with a 完成 seal, one pip per card and the day streak; the score is kept per device (`memo-daily-result`, only the day's own round) and the stamp animates once a day (`memo-daily-celebrated`). 69 tests. Before it, `27373c9` (sign-in check fix; live endpoint verified to reject requests without a valid sign-in) on top of `4539a5c` — **pronunciation buttons and the monthly HSK level check.** Speaker buttons (`src/components/ui/SpeakButton.tsx`, `src/lib/speech.ts`) use the browser's built-in voice, preferring Taiwan Mandarin and never Cantonese, at 0.85 speed; shown only for text containing Chinese, on flashcards, Learn, story lookups and set-page rows. Level check (`/level`, sidebar item with a red dot when due and an "HSK n" badge): `api/level-test.ts` (Anthropic SDK, `claude-opus-5-5`, server-side fallbacks, JSON-schema output, signed-in users only via the Supabase token, 30 requests / 10 min per user) writes 5 items per stage (2 vocabulary, 2 grammar, 1 reading, Traditional), a second blind pass keeps only items whose answer it agrees with, and grades the writing task. Staircase in `src/lib/levelTest.ts`: start at the last level (HSK 2 first time); 80%+ climbs, 40% or less drops, otherwise it settles; max 4 stages, no level repeated; estimate = highest level passed at 60%. Writing is a sentence for HSK 1–3, a paragraph for HSK 4–6; overall = (3×quiz + writing)/4. Results live in Supabase auth `user_metadata.memo_levels` (newest 6) — no table/migration; due after 30 days. Roughly 10–25¢ of API credit per check. Tested with a mocked API in the preview (68 tests); the real endpoint needs a live run. Before it, `3d7c273` — mobile scrolling fix (app shell uses `100dvh` so content isn't hidden behind iPhone Safari toolbars; inner scroller uses `overscroll-behavior: contain`; the mode picker's hover-expanding Flashcards row only applies on hover-capable devices) and a Daily 10 Term first / Definition first toggle (default term, saved per device as `memo-daily-side`). Verified live 21 October. Before it, `68d111b` — **story word lookups use a built-in CC-CEDICT dictionary, no AI.** Selecting story text shows pinyin + English from `public/cedict.txt` (CC BY-SA 4.0; built by `scripts/build-cedict.mjs`, credited in the card, file header and README), loaded once on first lookup (~3.7 MB Brotli). `src/lib/dictionary.ts` splits selections into longest dictionary words; Save to deck stores "pīnyīn — meaning"; words not in the dictionary can't be saved. The unused AI `/api/lookup-word` endpoint was removed. The lookup card renders into `<body>` (a leftover transform on the story wrapper had made `position: fixed` relative to it — the real cause of the old drifting save bar). Verified live 19 October (63 tests). Before it, `62538b7`: **Daily 10** (`/daily`, Home card under the calendar). Ten cards across all sets: overdue reviews first, up to 3 new words, then the weakest others; English → recall Chinese. Each day's round uses `dailySessionId(user, day)` (`src/lib/daily.ts`), so a recorded session with that id = done today on any device; recorded as a `flashcard` session with `set_id` null (no schema change). Unfinished rounds resume; "10 more" rounds use random ids and skip cards reviewed today. Verified live 19 October (59 tests). Before it, `1ccd77f`: set page can sort cards Original / Weakest first / Strongest first (mastery level, then review interval, then original position; choice saved per device as `memo-card-sort`), and unseen cards reserve the badge width so the term/definition divider aligns. Vercel success and the live chunk were verified on 18 October. Before it, `97960d7` shipped the graphite night palette (cream emphasis + cyan actions, red only for misses via `--miss`) and Chinese flashcard terms sized by length; `432c2e4` tagged Chinese multiple-choice options `lang="zh-Hant"` (`src/lib/cjk.ts`) at 24px (22px on phones), and `856b47a` made the resume prompt show real progress (Learn counts practised + started cards) and skip sessions with no answers. Vercel success and the live study CSS/wording were verified on 18 October. Earlier: `e1a4514` night palette / folder colors, `ae85281` two-ink palette.
- Latest verification: 54 automated tests passed (new: 2 resume-progress, 1 Chinese-detection); earlier palette checks: 51 tests passed; type check and production build passed. A contrast audit of every visible text element found no WCAG AA failures in light or dark on Home, all sets, set details, new set, master deck, mode picker, Learn and flashcards. Story and sentence screens need the AI endpoints and were checked from CSS only. Browser checks used synthetic cards rather than real study data.
- Jeffrey prefers changes to go live straight away: work in the release checkout and push to main, after tests and build.

## Where the work lives

- User's original folder: `/Users/JeffreyWu/Desktop/6. APP DEVELOPMENT/memo-p3`
- Release checkout: `/Users/JeffreyWu/Documents/Codex/2026-10-13/thi/work/memo-release`
- Synthetic browser preview: `/Users/JeffreyWu/Documents/Codex/2026-10-13/thi/work/memo-ui-preview`

The original folder's Git HEAD is still `07be8e1`, with newer source changes present as uncommitted files. It was synced from the release checkout after `3d7c273`; do not discard those changes or assume the original HEAD reflects the deployed app. Compare files before copying between folders, especially if another program has edited them. The preview contains a fake backend and must never be copied over the production Supabase client.

## Completed

- Reliable stable card IDs and atomic set saving; durable queued writes and recoverable study drafts. Existing database migration was applied on 14 October; see README for migration details. No database migration or reset was performed during the 16 October Learn audit.
- Quick edits during study, clearer control labels, uniform study controls, persistent shuffle toggle with an active accent state.
- Archive-style daily almanac on Home, week view by default with month toggle, greeting/New set in its header, Chinese month/day labels, aligned streak and period totals.
- Shared typography: Inter for the app, Noto Sans TC for Chinese, Archivo Black for display. Body, navigation and supporting UI generally 14px; section 18px; page 28px; larger study-card text retained.
- One Mastery formula for Home hover, set details and session results: average card level (0–4) divided by four. Level 4 alone counts as mastered. Missing a known card does not label it unseen.
- Learn records answers immediately before feedback animations; fixes single-card retries, stale/double submissions, recovery after deleted cards, legacy drafts and batch transitions.
- Recognition alone does not advance Learn's review schedule; successful recall does. Early and repeated same-day practice cannot repeatedly increase an established interval. Due cards are prioritised.
- Reading a story or tapping a definition no longer silently changes mastery.
- Local-day review dates, paginated history/SRS reads, account-scoped offline caches, pending activity overlays, and protection against stale activity fetches.
- Removed Home’s “Cards studied total” and “Sets created” statistics.
- Two-ink palette (17 October): all app colors come from shared tokens; the previously undefined `--radius-*` / `--transition-fast` names are now aliases, so flashcards, sign-in and set-page buttons are rounded again.

Details and boundaries: [Learn/progress audit](docs/learn-progress-audit.md).

## Palette — shipped 17 October

Jeffrey found lime accents + forest-green calendar + red header + cream too busy. He chose to follow his reference photo (a risograph wall calendar: warm paper, red-orange and cyan). Now live: one two-ink palette in `src/styles/globals.css`, with the almanac restyled from the same tokens. Roles and rules are in the [palette plan](docs/palette-plan.md).

Typography, layout, week/month behavior, mastery logic and saving behavior were unchanged. Do not add more fonts to solve a color problem.

Decided 18 October and shipped in `97960d7`:
- **Night palette: Graphite** (Jeffrey's pick over Moonlight/navy and Lamplight/amber). Red read as clashing at night, so the dark theme maps the red ink's emphasis role to cream and leads actions with cyan; red is reserved for misses/errors through `--miss` / `--red-*`.
- **Chinese size on flashcards: sized by length** (option C), applied only to text containing Chinese: 1–2 chars 96px (88px phones), 3–4 chars 72px (60px), longer 48px (40px). Uses `chineseLang()` / `termLength()` in `src/lib/cjk.ts`, same tagging as multiple-choice options.

Still open: which calendar motifs (display numerals, rules, striped bands, pills, overprint) to carry into the rest of the app — listed in the palette plan.

## Next-generation learning — proposed, not implemented

Jeffrey likes smarter practice and better timing. We explained that these can primarily use programming and scheduling algorithms; AI is optional for language explanations and grading alternative wording.

Recommended order:
1. Permanent answer-event history, with idempotent writes and actual study dates.
2. Explicit recognition → recall → retry/review transitions, adapting support to performance.
3. Evaluate an adaptive scheduler such as FSRS after gathering trustworthy history.

Also proposed on 21 October (Jeffrey asked about them; not built yet):
- **Pronunciation** and **Level check** — shipped in `4539a5c` (see Current state).
- **RPG-style profile stats** (opens from the profile name): three mockups shown 21 October — A stat sheet (slanted segment bars per skill, CuteKart-like), B level-up card (HSK badge, XP bar from words mastered, "Take the level check" button, Paladin-like), C riso poster (overprinted numeral + skill diamond, last month red vs now cyan). Mockup file: `docs/rpg-stats-options.html` in the original folder (untracked). Awaiting Jeffrey's pick.
- **Design reference kept for later:** a clean vocabulary app with pastel-tinted cards, black line illustrations, serif titles and a "Learning fast" stats card. Not adopted; noted in the palette plan.
- Original proposal text for the level check, kept for context: a sidebar item, not on Home; self-triggered with a monthly nudge. Claude would generate an adaptive test (vocabulary, reading, grammar, optional sentence writing) that moves up or down a level as you answer, ending in an estimated HSK level per skill. Results would need a new table (first schema change in a while), and the level could later drive story difficulty and suggested HSK word sets. AI-written questions need answer-key checks; the result is an estimate, not an official HSK score.

Important remaining limitations: the latest-state model can conflict across simultaneous offline devices; one session timestamp cannot represent every day of a multi-day session; current mastery is a level-based score, not calibrated recall probability or time-based decay. Existing historical intervals were retained, not retroactively recalculated. See the audit for other study-mode follow-ups.

## Working agreement for handoffs

Keep this file updated at the end of a work session: what changed, what was tested, what was deployed (commit/date), what remains undecided, and the next concrete step. Update relevant design/audit notes rather than making chat history the only record. Keep proposals distinct from shipped features. Never include secrets or user study content in these notes.

Before changes: inspect the working tree and read relevant notes. Before deployment: run suitable tests and the production build; preserve unrelated local edits. Use an output directory outside the repository for builds because this project has historically tracked `dist`. The release checkout's untracked `node_modules` is now a real install (it was a symlink until `@anthropic-ai/sdk` was added on 21 October); never commit it. The original folder needs `npm install` to get the SDK. Deployment uses a push to GitHub main followed by Vercel verification. Pushes that include the 8 MB dictionary need `git -c http.postBuffer=157286400 push` (the default buffer gets an HTTP 400).
