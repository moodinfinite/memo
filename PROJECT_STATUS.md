# Memo — project handoff

Updated: 17 October 2026. Start here when switching editors or coding assistants.

## Current state

- App: personal flashcards and language-learning tool, built with React, TypeScript, Vite and Zustand; Supabase stores accounts and study data.
- Live app: https://memo-mocha-nine.vercel.app/
- GitHub: https://github.com/moodinfinite/memo
- Last verified deployed commit: `432c2e4` — multiple-choice options containing Chinese are tagged `lang="zh-Hant"` (`src/lib/cjk.ts`) and shown at 24px (22px on phones) in Learn and Multiple choice mode. Before it, `856b47a` made the resume prompt show real progress (Learn counts practised + started cards) and skip sessions with no answers. Vercel success and the live study CSS/wording were verified on 18 October. Earlier: `e1a4514` night palette / folder colors, `ae85281` two-ink palette.
- Latest verification: 54 automated tests passed (new: 2 resume-progress, 1 Chinese-detection); earlier palette checks: 51 tests passed; type check and production build passed. A contrast audit of every visible text element found no WCAG AA failures in light or dark on Home, all sets, set details, new set, master deck, mode picker, Learn and flashcards. Story and sentence screens need the AI endpoints and were checked from CSS only. Browser checks used synthetic cards rather than real study data.
- Jeffrey prefers changes to go live straight away: work in the release checkout and push to main, after tests and build.

## Where the work lives

- User's original folder: `/Users/JeffreyWu/Desktop/6. APP DEVELOPMENT/memo-p3`
- Release checkout: `/Users/JeffreyWu/Documents/Codex/2026-10-13/thi/work/memo-release`
- Synthetic browser preview: `/Users/JeffreyWu/Documents/Codex/2026-10-13/thi/work/memo-ui-preview`

The original folder's Git HEAD is still `07be8e1`, with newer source changes present as uncommitted files. It was synced from the release checkout after `432c2e4`; do not discard those changes or assume the original HEAD reflects the deployed app. Compare files before copying between folders, especially if another program has edited them. The preview contains a fake backend and must never be copied over the production Supabase client.

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

Open decisions (18 October), mocked up in the synthetic preview, nothing shipped:
- **Night palette:** Jeffrey finds red as the night accent clashing. Options shown: Moonlight (cream display type + cyan on navy; red only for misses/errors — recommended), Lamplight (amber replaces red on navy), Graphite (cream + cyan on neutral near-black). All three pass the contrast audit on Home.
- **Chinese size on mobile flashcards:** the card term drops to 24px on phones (Learn 26px), which is too small for characters. Options shown: bigger everywhere (40px), Chinese-aware (Chinese 56px, English unchanged), sized by length (1–2 chars 88px, 3–4 chars 60px, longer 40px). Recommended: combine Chinese-aware with length sizing. Multiple-choice options already use the Chinese-aware tagging (`432c2e4`), so the flashcard change can reuse `chineseLang()`.
- Later: which calendar motifs (display numerals, rules, striped bands, pills, overprint) to carry into the rest of the app — listed in the palette plan.

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
