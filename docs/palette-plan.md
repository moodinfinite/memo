# Memo palette — two inks, shipped

17 October 2026. Deployed in `ae85281`. Replaces the 16 October discussion proposal.

## Decision

Jeffrey chose to follow his reference photo — a risograph-printed wall calendar — over the quieter "paper + blue" option. The whole app now uses one palette: warm paper, a red-orange ink and a cyan ink, plus dark warm text. No other accent families.

## Tokens (`src/styles/globals.css`)

| Family | Expressive (large type, rules, fills) | Strong (small text, filled buttons) | Tint | Border |
|---|---|---|---|---|
| Red | `--ink-red` #ee432d | `--ink-red-strong` #c2311e | `--ink-red-tint` | `--ink-red-border` |
| Cyan | `--ink-cyan` #36bed7 | `--ink-cyan-strong` #0a7590 | `--ink-cyan-tint` | `--ink-cyan-border` |

Paper `--bg-base` #fbf8f1, raised #fffdf8; ink `--text-primary` #2a2321. The bright inks fail small-text contrast; use the strong shades for anything under ~18px.

Night theme — "graphite" (18 Oct, third pass, `97960d7`): near-black paper (base #141516, raised #1e1f22) with cream #efe9df and cyan #6cc3d3 / #8bd2df. Red as the main accent clashed at night on both warm near-black (17 Oct, first pass) and midnight blue (17 Oct, second pass), so at night the red ink's **emphasis** role (display type, calendar numerals, Mastered, `--ink-red*` tokens) is remapped to cream and primary actions use cyan. Red stays only as the **miss** color (`--miss` #ff8a70 and `--red-*`): "Still learning", wrong answers, errors, warnings. Use `--miss` — not `--ink-red` — for anything that means a mistake, so it stays red in both themes. At night the almanac's grain, graph paper, stripes and date offset are toned down. Rejected night options: Moonlight (cream + cyan on navy) and Lamplight (amber replacing red on navy).

## Roles

- **Red = do / emphasis:** primary buttons (`--primary`), display type, calendar numerals, the Mastered stamp, misses ("Still learning", errors — always labelled or iconed).
- **Cyan = structure / state:** selection, focus ring, progress bars and Home's mastery fill, correct answers (with ✓), calendar rules and headers.
- **Mastery ramp:** levels 1–3 deepen through cyan, level 4 (Mastered) is red, matching the calendar's weekend suns. Level numbers use body text color for legibility.
- **Neutral:** sentence feedback "Good" is neutral rather than a third color.
- **Folders:** colors are auto-assigned by position (there is no picker), now from `--folder-1…6` (cyan, red, deep cyan, overprint violet, salmon, gray). Folders saved with the six pre-palette hex values are translated on load in `foldersStore`; the database rows are unchanged.
- **Mastery % on Home's hover overlay** uses the body font, not the display font.
- **Chinese text size:** text containing Chinese is tagged `lang="zh-Hant"` (`chineseLang()` in `src/lib/cjk.ts`). Multiple-choice options show it at 24px (22px phones); flashcard terms scale by length via `data-length` (`termLength()`): 1–2 chars 96/88px, 3–4 chars 72/60px, longer 48/40px. English keeps its size.

Rule of thumb: one loud red thing per screen — the calendar on Home, the primary button elsewhere.

## Calendar treatment (Home almanac)

Red display greeting on paper over a double cyan rule (no solid header block); cyan month band with the Chinese month on a red tint; red date with a cyan offset like print misregistration; striped cyan weekday band with red pills (weekend inverted); dashed red column rules on faint cyan graph paper; studied days get a ringed red disc, today a cyan ring, days ahead outlined cyan numerals. Paper grain kept.

## Options to carry the calendar into the rest of the app — not yet decided

1. Display numerals for counts that matter (card counter, session score, mastery %, streak burst) in red Archivo Black.
2. Print rules as the divider language: double cyan rule under page titles, dashed red divider between term and definition.
3. Pills and stamps for small labels (mode tag, Master Deck badge, mastery levels) like the weekday pills.
4. Striped cyan band as the selected / active marker (selected mode card, progress-bar track).
5. Cyan offset (misregistration) on page titles, as on the big date.
6. Faint cyan graph-paper texture on the flashcard face.

Suggested order: 1–3 first (low risk, most cohesion), 4–6 as optional flourishes.

## Reference kept for later (21 October)

Jeffrey liked how clean a vocabulary app looked: pastel-tinted cards (one soft tint per card), simple black line illustrations, serif card titles, generous white space, and a compact "Learning fast" stats card. Kept as a future reference only — not adopted. If borrowed, map the tints onto the existing `--ink-*-tint` tokens rather than adding colors.
