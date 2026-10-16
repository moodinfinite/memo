# Memo — project handoff

Updated: 16 October 2026. Start here when switching editors or coding assistants.

## Current state

- App: personal flashcards and language-learning tool, built with React, TypeScript, Vite and Zustand; Supabase stores accounts and study data.
- Live app: https://memo-mocha-nine.vercel.app/
- GitHub: https://github.com/moodinfinite/memo
- Last verified deployed commit: `6498fe7` — unified mastery and hardened Learn recovery, scheduling and activity tracking. Vercel success and matching live bundle were verified on 16 October.
- Latest verification: 51 automated tests passed; production build passed. Browser checks used synthetic cards rather than real study data.
- This handoff and the palette plan are documentation updates after that deployment. The palette has NOT been implemented or approved.

## Where the work lives

- User's original folder: `/Users/JeffreyWu/Desktop/6. APP DEVELOPMENT/memo-p3`
- Release checkout: `/Users/JeffreyWu/Documents/Codex/2026-10-13/thi/work/memo-release`
- Synthetic browser preview: `/Users/JeffreyWu/Documents/Codex/2026-10-13/thi/work/memo-ui-preview`

The original folder's Git HEAD is still `07be8e1`, with newer source changes present as uncommitted files. It was synced from the release checkout after `6498fe7`; do not discard those changes or assume the original HEAD reflects the deployed app. Compare files before copying between folders, especially if another program has edited them. The preview contains a fake backend and must never be copied over the production Supabase client.

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
- Removed Home's “Cards studied total” and “Sets created” statistics.

Details and boundaries: [Learn/progress audit](docs/learn-progress-audit.md).

## Current discussion — palette, planning only

Jeffrey feels the current combination of lime app accents, forest-green calendar, red header and cream background is too busy. New reference: a printed calendar with warm white paper, vivid red-orange typography and cyan-blue rules/headers.

See [palette plan](docs/palette-plan.md). Proposed direction: one shared red/blue family across the app, restrained color outside the calendar. Decision pending: blue-led controls with red calendar accents, or stronger red-led poster styling. No live palette change yet.

Preserve the approved typography, layout, week/month behavior, mastery logic and saving behavior while evaluating color. Do not add more fonts to solve a color problem.

## Next-generation learning — proposed, not implemented

Jeffrey likes smarter practice and better timing. We explained that these can primarily use programming and scheduling algorithms; AI is optional for language explanations and grading alternative wording.

Recommended order:
1. Permanent answer-event history, with idempotent writes and actual study dates.
2. Explicit recognition → recall → retry/review transitions, adapting support to performance.
3. Evaluate an adaptive scheduler such as FSRS after gathering trustworthy history.

Important remaining limitations: the latest-state model can conflict across simultaneous offline devices; one session timestamp cannot represent every day of a multi-day session; current mastery is a level-based score, not calibrated recall probability or time-based decay. Existing historical intervals were retained, not retroactively recalculated. See the audit for other study-mode follow-ups.

## Working agreement for handoffs

Keep this file updated at the end of a work session: what changed, what was tested, what was deployed (commit/date), what remains undecided, and the next concrete step. Update relevant design/audit notes rather than making chat history the only record. Keep proposals distinct from shipped features. Never include secrets or user study content in these notes.

Before changes: inspect the working tree and read relevant notes. Before deployment: run suitable tests and the production build; preserve unrelated local edits. Use an output directory outside the repository for builds because this project has historically tracked `dist`. The release checkout's untracked `node_modules` is a local symlink, not a file to commit. Deployment uses a push to GitHub main followed by Vercel verification.
