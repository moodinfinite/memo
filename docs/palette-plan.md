# Memo palette plan — decision pending

16 October 2026. This is a discussion proposal; no app styles have been changed.

## Intent

Borrow the supplied printed calendar's two-ink character: warm white, red-orange, cyan/blue, and dark text. Simplify the current lime + forest green + rust combination. Keep the approved layout, typography and paper texture subtle.

## Two directions to compare

**Paper + blue (recommended):** mostly warm-white surfaces. Red gives the big date and a few calendar details personality. Blue owns primary actions, selected states, mastery fill and studied-day marks. A neutral greeting area with a thin red rule reduces the large block of color. This is quieter during long study sessions.

**Poster red:** keep a red greeting band and more prominent red calendar typography; use red for primary actions and mastery, cyan/blue for calendar structure. This is closer to the reference but stronger throughout the app, and needs especially clear labels/icons to distinguish ordinary actions from destructive ones.

Suggested light-theme starting colors (to refine with Jeffrey): paper `#FAF8F2`, dark ink `#252928`, expressive red `#EE432D`, darker red for small text/buttons `#B93225`, cyan detail `#36BED7`, darker blue for small text/buttons `#087A96`. Lighter/darker values are shades of the same two color families, not additional accent families. These are proposed values, not claimed pixel samples from the photo.

## Roles, not arbitrary recoloring

- Neutral paper/white surfaces and dark readable text do most of the work.
- One primary action color, shared by buttons, links, active shuffle, mastery and navigation selection.
- One editorial accent for calendar typography and limited decoration.
- Study outcomes stay explicit: “Got it” with a check, “Still learning” with its label; do not rely on red/green alone. Consider a neutral retry state to avoid another competing color.
- Errors and destructive actions remain clearly labelled with their own semantic tokens. Brand red must not make a normal button look like an error.
- Replace the multicolor mastery badge rainbow with levels, labels and a restrained shared color family; confirm this in the next preview.
- Do not silently recolor user-selected folder colors; discuss a subdued badge treatment separately.
- Preserve readable small text. Bright cyan is suitable for rules and illustration; use a darker blue for small text or filled controls with light text, verified against the actual background.

## Rollout after the direction is chosen

1. Confirm blue-led or red-led, then confirm how much of the reference's saturation to retain.
2. Preview the same palette on Home, set details and an active study card, in light and dark themes. Keep existing layout and type unchanged unless separately approved.
3. Define shared theme tokens for surfaces, ink, primary actions, editorial accents and feedback; make the calendar consume the same families as the rest of the app.
4. Replace hardcoded greens/rust and competing mastery colors across those screens and shared controls; preserve user-authored folder colors.
5. Verify contrast, keyboard focus, hover/pressed/error states and mobile layout. Run the build and relevant checks, then deploy after the design is agreed.

Open decision: **Paper + blue** or **Poster red**? The inline mockups explore placement and intensity; they are not a deployed redesign.
