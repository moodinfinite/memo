# Weekly Code Health Audit — 2026-06-27

No new commits landed in the last 7 days (last commit was 2026-06-20, a docs-only
security review). So this audit reviewed the current state of the most recently
changed code — the study-session persistence flow added across the prior two
weeks (`studyStore.ts`, `StudyPage.tsx`, `SentenceSummary.tsx`, `StoryCard.tsx`).

## Top 3 issues

### 1. "Slow connection" warning was unreachable (real bug)
`_persist()` in `studyStore.ts` sets `persistError` to a transient info message
("Slow connection — still saving, hang tight…") 8s into a save, while
`isPersisting` stays `true` until the 25s deadline or response. But the UI in
`StudyPage.tsx` only rendered `persistError` inside a block gated on
`!isPersisting`. Result: the message was set in state but never painted —
users on a slow connection just stared at a generic "Saving session…" spinner
for up to 25s with no reassurance, even though the feature to tell them
otherwise existed in the code.

**Why it matters:** this is exactly the kind of bug that looks done (state is
set, copy is written, commit message says "8s slow warning") but silently
does nothing in production — and it's on the most common save path (every
flashcard/MC/typed/learn session completion).

**Fix applied:** the spinner row now renders `persistError ?? 'Saving
session…'` while `isPersisting` is true, so the slow-connection copy displays
during the wait instead of being swallowed. Same overload existed in
`SentenceSummary.tsx` (worse there — it rendered the info text in an
unconditional red "error" box *simultaneously* with the saving spinner); fixed
the same way.

### 2. Sentence-mode completion screen had no retry path for failed saves
`StudyPage.tsx`'s main completion screen has Retry/Dismiss buttons wired to
`retryPersist`/`dismissPersistError` (added two commits ago specifically to fix
retry reliability). `SentenceSummary.tsx` — the completion screen for sentence
mode — never received that wiring. If a sentence session failed to persist,
the user saw a static error string with no way to retry; their only options
were to navigate away, silently losing the session.

**Why it matters:** the whole point of the retry-stacking fix was reliable
session saves. Landing it in one of two completion screens but not the other
is a feature-parity gap that's easy to miss because sentence mode is used less
than flashcards.

**Fix applied:** passed `retryPersist` down to `SentenceSummary` and added a
Retry button next to the error message, reusing the existing error styling.

### 3. Dead destructured variables (recurring pattern, no lint guard)
`answerLearnCard` in `studyStore.ts` destructured `learnQueue` and
`learnCards` from `get()` but never used either inside the function. This is
the same category of issue fixed in last week's audit (an unused
`learnBatchSummary` destructure in a neighboring function). It keeps
recurring because `tsconfig.json` has `noUnusedLocals: false` and the repo has
no ESLint config — nothing catches dead destructures at edit time.

**Why it matters:** low risk on its own, but it's the second time this exact
mistake has shipped in the same file in two consecutive weeks. The pattern
points at a missing guardrail, not just a one-off typo.

**Fix applied:** removed the two unused bindings. Recommend (not done here,
since it's a repo-wide config change beyond this week's scope): turn on
`noUnusedLocals` in `tsconfig.json` so the compiler catches this class of bug
before it ships.

## Notes
- `npx tsc --noEmit` passes clean after the fixes.
- No architecture drift observed — the persistence/retry pattern introduced
  recently is consistent with the rest of the store.
