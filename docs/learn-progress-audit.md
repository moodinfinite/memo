# Learn and mastery audit — 16 October 2026

Memo's learning system is usable, but it was mixing three different things: finishing today's practice, encountering a card, and building long-term mastery. This update makes the mastery score consistent and repairs the verified failures below. It preserves existing cards and review records; no database migration or history reset is included.

## What changes for you

Home hover, set details, and session results now use the same **Mastery** calculation. Each card contributes its level from 0 to 4; the set percentage is the average level divided by four. Results show the change in that same percentage, across the whole set even when you practise a subset. Master Deck results use the same formula across all included cards.

| Level | Meaning | Contribution |
| --- | --- | --- |
| 0 — Unseen | No review record | 0% |
| 1 — Introduced | Started, or needs rebuilding after a miss | 25% |
| 2 — Familiar | At least two successful review steps, interval at least 3 days | 50% |
| 3 — Confident | At least three successful review steps, interval at least 10 days | 75% |
| 4 — Mastered | At least four successful review steps, interval at least 21 days | 100% |

This is a progress score, **not a measured probability that you will remember something**. A first miss establishes that a card has been introduced; it does not make it “unseen” again. Only level 4 is counted as mastered. Previously Home showed coverage, so a lower new percentage does not mean your saved data disappeared. Existing historical review intervals are preserved, including any that the old rules advanced too quickly.

Learn still uses five-card batches: recognition followed by self-assessed recall, with two consecutive correct responses to finish a card. When there aren't three distinct, unambiguous alternatives, it uses flashcards. Completion now says “Practice complete,” because completing a batch is not the same as mastering it.

## Verified problems fixed

| Finding | Change |
| --- | --- |
| Home counted cards touched, results used weighted levels, and detail counted confident cards as mastered. | One percentage formula, consistent labels and counts, one mastery fill on set details. Removed both requested Home statistics. |
| Learn sent every response into the spaced-review scheduler, including recognition and recall seconds apart. | Correct recognition is practice; successful recall earns review credit. Misses are recorded immediately. |
| Repeated or early practice kept increasing intervals. | Successful practice before the due date, or additional successes on the same local day, cannot advance an established schedule. A failed card can recover to the introductory step. |
| Delayed feedback callbacks could lose an answer on navigation or refresh. | Learn commits the answer and durable draft immediately; feedback timers only control presentation. |
| A wrong answer on the final remaining card could leave controls stuck; the flash timer could also unlock too early. | Feedback resets for each answer, including the same card; synchronous input lock and session/turn tokens prevent duplicates and stale submissions. |
| Deleted cards shifted a saved numeric batch index; old drafts without Learn state could appear complete. | Recovery reconciles card identities, restores missing queue members, and guards story/batch transitions. |
| Duplicate terms or equivalent definitions could produce ambiguous Learn choices. | Normalize and deduplicate alternatives, exclude equivalent prompts, and fall back to recall when needed. |
| Learn shuffled due and not-due cards together. | Due/unseen cards come first, shuffled within each group. |
| Leaving a story silently graded words based on whether their definitions were tapped. | Removed automatic story grading. Reading and dictionary lookups do not change mastery. |
| Review dates used UTC while the study calendar used local dates. | Review dates and due checks now follow the local calendar. |
| Synced mastery disappeared on an offline reload; pending sessions were absent from activity. | Account-scoped local caches plus pending-write overlays retain available mastery and calendar activity. Undo-to-zero removes pending activity correctly. This does not add full offline deck loading. |
| SRS/history reads assumed one database response held all records; older fetches could replace newer activity. | Read all ordered pages, discard partial failures, and reject superseded activity responses. |
| Reopening or saving an old draft could claim a new study day without an answer. | Session timestamps now track the last actual answer and survive draft recovery and undo. |

## Validation

- 51 automated checks passed, including the existing saving/database checks and 12 new Learn/progress cases.
- Production TypeScript/Vite build passed.
- Read-only production checks found 247 SRS rows and 69 session rows at audit time; no invalid intervals/ease/repetition values or missing review dates in the checked fields. Today's data is below the usual API page limit; pagination is preventive.
- Browser verification uses synthetic local cards, not your production study history. Checked matching Home/detail scores, last-card wrong-answer recovery, and refresh immediately after an answer followed by resume and completion.
- No production database rows, schema, policies, or authentication settings were changed by this audit.

## Next generation: recommended order

**1. Record each answer permanently.** Add an append-only review-event table with a unique event ID, card/session IDs, actual answer time and local study date, mode, recognition/recall distinction, result, and scheduler version. Apply events idempotently on the server and derive the current schedule and daily activity from them. Keep existing rows as a legacy baseline; do not invent missing historical events.

This addresses two remaining structural limitations: simultaneous offline devices can overwrite the same latest-card snapshot, and a session with answers on multiple days currently has only one `completed_at` value, so it cannot faithfully represent every day. The timestamp fix prevents navigation alone from manufacturing activity, but it cannot reconstruct days that were never separately recorded. An event history also makes undo, explanations, and future algorithm changes auditable.

**2. Make Learn an explicit state machine.** Use states for recognition, recall, short retry, scheduled review, and complete. Keep feedback separate from learning state. Give due reviews priority and a modest new-card budget; allow optional typed recall and make stories optional enrichment. Record recognition and self-assessment separately rather than treating all modes as equally strong evidence. Existing MC, flashcard, and sentence modes still share a binary review interface; calibrating those evidence types is future work.

**3. Pilot an adaptive scheduler.** Evaluate FSRS using the new review history, initially alongside the current scheduler without changing due dates. Anki documents that FSRS can fit parameters to review history and balance desired retention against workload. Adopt it only after comparing actual recall, review load, lapse recovery, and offline replay behavior. See [Anki's FSRS documentation](https://docs.ankiweb.net/manual/deck-options#fsrs). This is a proposed direction, not a claim that Memo currently implements FSRS.

Keep one visible Mastery score, a separate factual “reviews due” count, and a clearly labelled session position. A completed session should never imply permanent knowledge. The current level-based mastery does not decay just because time passes; a later calibrated model could explain “needs review” without erasing the user's sense of achievement.

## Remaining boundaries

- The review model remains a simplified SM-2-style heuristic; existing inflated intervals cannot be reliably recalculated without historical events.
- Browser local storage and the existing durable outbox are retained. Storage failure remains visible. IndexedDB plus an atomic event/outbox transaction would be a stronger long-term foundation.
- This is not a full security audit, load test, or guarantee of conflict-free multi-device offline editing.
- Outside Learn, the older multiple-choice generator and empty-focus-filter fallback deserve a separate follow-up: filters can fall back to all cards, and filtered decks can contain too few distinct quiz choices. This release does not redesign those study modes.

Implementation references: `src/store/studyStore.ts`, `src/store/srsStore.ts`, `src/store/progressStore.ts`, `src/lib/mastery.ts`, `src/components/cards/LearnCard.tsx`, and `tests/learn-progress.test.mjs`. Pagination follows the [Supabase range API](https://supabase.com/docs/reference/javascript/range).
