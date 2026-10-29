---
name: Screen-Time
description: Second-by-second proof a product was seen in creator video, checked against the contract.
colors:
  ground: "#f7f8fa"
  surface: "#ffffff"
  sunken: "#eef0f3"
  ink: "#0e1116"
  ink-2: "#444b57"
  ink-3: "#69707d"
  line: "#e3e6eb"
  line-strong: "#cfd4db"
  lime: "#c8f031"
  lime-ink: "#2f3a00"
  violet: "#6e56cf"
  violet-soft: "#ece8fb"
  pass: "#127a4b"
  pass-soft: "#e3f3ea"
  fail: "#c2362f"
  fail-soft: "#fbe7e5"
  unsure: "#9a6b00"
  unsure-soft: "#fbf1d9"
  focus: "#3b5bdb"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  figure:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "\"tnum\""
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  section-label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"ss01\", \"cv11\""
  meta:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  timecode:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\""
  ruler:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\""
rounded:
  hairline: "2px"
  box: "3px"
  strip: "6px"
  control: "8px"
  card: "10px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  chip-suggestion:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  nav-link:
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.strip}"
    padding: "6px 10px"
  nav-link-hover:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  verdict-delivered:
    backgroundColor: "{colors.pass-soft}"
    textColor: "{colors.pass}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  verdict-short:
    backgroundColor: "{colors.fail-soft}"
    textColor: "{colors.fail}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  verdict-review:
    backgroundColor: "{colors.unsure-soft}"
    textColor: "{colors.unsure}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-progress:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  term-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "12px 16px"
  term-row-active:
    backgroundColor: "{colors.sunken}"
  screen-time-strip:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.strip}"
    height: "44px"
  screen-time-strip-mini:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.strip}"
    height: "10px"
  overlay-box-label:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.box}"
    padding: "1px 6px"
---

# Design System: Screen-Time

## Overview

**Creative North Star: "The Marked Tape"**

Screen-Time reads like a time tape that someone has gone over with a highlighter. The working surface is a cool, quiet paper: near-white ground, ink text, hairline rules, almost no colour. Against that calm, one signal is loud on purpose. Highlighter lime marks every second the product was actually on screen, in the strip under the player, the boxes over the video, the bars in the roll-up table and the swatch beside the total. Everything else stays neutral so that lime always means one thing.

The density follows the Linear and Stripe category standard the brief pinned. Tables are tight, figures line up, and each screen opens on a verdict with its evidence attached instead of a row of same-size stat cards. Violet carries spoken mentions. A three-tone verdict palette (pass, fail, unsure) carries judgement. A single focus blue carries keyboard focus. No other hues appear.

The world is light-only and flat by default. Depth comes from hairline borders on white cards set on a slightly darker ground. The one heavy shadow belongs to the video player, which is the only object on the page with physical weight.

**Key Characteristics:**
- Cool paper ground, white cards, 1px hairlines; colour is spent on meaning, not decoration.
- Lime means product on screen, and nothing else does.
- Verdicts come first and use their own pass, fail and unsure tones; progress stays ink and neutral.
- Geist everywhere, with tabular figures; Geist Mono only for timecodes.
- The screen-time strip is the signature: a seekable time ruler that every number points back to.

## Colors

A near-monochrome ink-on-paper palette with one committed signal colour, one secondary signal and a three-tone verdict set.

### Primary
- **Highlighter Lime** (lime): on-screen seconds. Used for strip segments, mini-strip segments in tables, the 2px overlay box around a counted product, the "Brand product" box label, the legend swatch and the inline swatch beside the seconds-on-screen total. It is never used as a fill for status, progress, buttons or emphasis.
- **Lime Ink** (lime-ink): the dark olive that sits on or against lime. Used for text on lime labels, the first-seen marker (a downward notch at the top of the strip) and the longest-run underline (a 3px bar along the strip's bottom edge).

### Secondary
- **Spoken Violet** (violet): spoken brand mentions. Used for mention ticks on the strip, mention timecodes in the "Brand said aloud" list and the legend swatch.
- **Violet Wash** (violet-soft): the hover fill behind a mention row. It appears only in the mention list.

### Tertiary (verdicts)
- **Pass Green** (pass) on **Pass Wash** (pass-soft): "Delivered" verdicts, met contract terms and completed pipeline steps.
- **Fail Red** (fail) on **Fail Wash** (fail-soft): "Fell short" verdicts, unmet terms, stopped runs and error notes. Full-strength fail also draws rejected look-alikes: dashed boxes on the video and hatched dashed stretches on the strip.
- **Unsure Amber** (unsure) on **Unsure Wash** (unsure-soft): "Needs review" verdicts, terms that are not checkable, and the preview-data notice.

### Neutral
- **Cool Paper** (ground): the page background.
- **Card White** (surface): cards, tables, inputs, the sticky header (at 90% opacity with a light blur) and text on ink buttons.
- **Sunken** (sunken): the strip's empty track, the mix-bar track, pending and progress pills, row hover (at 50 to 60%) and the active term row.
- **Ink** (ink): primary text, primary buttons, the playhead, the active pipeline step and the 2px evidence outline on the strip.
- **Ink 2** (ink-2): secondary text and descriptions (9.3:1 on ground).
- **Ink 3** (ink-3): labels, table headers, captions, ruler labels and placeholders (4.8:1 on ground).
- **Hairline** (line) and **Strong Hairline** (line-strong): card borders and row dividers, then hover borders, the dashed upload well and scrollbar thumbs.
- **Focus Blue** (focus): the 2px focus outline and the text caret. It has no other role.

### Named Rules
**The One Meaning Rule.** Lime marks seconds the product was on screen and nothing else: no lime buttons, badges, progress, selection or decoration. If a lime pixel does not point to a counted second, remove it. Two brand exceptions, both pictures of the measurement: the mark, and on the landing page and share card a flat lime block behind the word "seen." (no tilt or pen texture, 2px corners, like a strip segment). Nothing else on the landing page uses lime outside real data: "Counted" is a verdict (pass) colour.

**The Verdict Owns Judgement Rule.** Pass, fail and unsure are the only colours that judge. Loading and in-progress states use ink and neutral greys, never lime or a verdict tone.

**The Rejection Carries Proof Rule.** A rejected look-alike is never hidden. It is drawn in fail red, always dashed (and hatched on the strip), so the rejection shows its own evidence.

## Typography

**Display Font:** none in the app. The landing page alone has a display tier in Geist semibold: the H1 at 44px (phone) and 60px, line-height 1.02, -0.035em; section heads at 30px, -0.025em; and the replay counter at 48px, -0.04em, with tabular digits and a proportional decimal point (so "6.9" never reads "6 . 9").
**Body Font:** Geist (with ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono (with ui-monospace), for timecodes only

**Character:** One neutral grotesk does all of the work at small, tight sizes. Hierarchy comes from weight and ink tone more than from size. The mono face appears only where the reader is reading a clock position.

### Hierarchy
- **Headline** (600, 22px, -0.015em): the one page title per screen (campaign name, creator · clip title). On the video page the clip title drops to 400 weight in ink-3.
- **Figure** (500, 20px, tabular): the roll-up verdict counts.
- **Title** (600, 15px): section heads on the run page and the large verdict badge. The verdict sentence beside it uses 500 weight in ink-2.
- **Section label** (600, 13px): sidebar and report sub-heads ("Contract terms", "What the tracker found").
- **Body** (400, 14px, line-height 1.5): all running text, table cells and form text. Descriptions are capped at 60 to 80ch.
- **Meta** (400, 13px): breadcrumbs, field hints and secondary report lines.
- **Label** (500, 12px): table headers (ink-3), badges (600), legend items, captions and the jump-to-second action.
- **Timecode** (Geist Mono 11 to 13px, tabular): ruler labels (11px), the live position readout (12px), mention timecodes (12px) and the clickable first-seen time (13px).

### Named Rules
**The Tabular Rule.** Every figure (seconds, counts, terms met, percentages) uses tabular numerals, and figure columns are right-aligned.

**The Clock Face Rule.** Geist Mono is reserved for time positions written as m:ss.s. Durations ("4.0 s") and counts stay in Geist.

## Layout

The page uses one centred column, 1240px wide, with 20px side padding on phones and 32px from 640px up. Content starts 32px below a 52px sticky header and ends 64px above the bottom. Spacing follows a 4px base with an 8px rhythm: 4, 8 and 12px inside components, 16px for card padding, 24px between blocks, and 32 to 40px between columns.

- **Roll-up:** at 1024px and up, the creator table sits beside a 320px sidebar (verdict counts, total on-screen seconds and contract terms) with a 40px gap. Below 640px the table becomes a stacked list card, and each row shows the creator, a status pill, a mini strip and the seconds.
- **Video report:** at 1024px and up, a 300px player column sits beside the verdict and checklist, and the screen-time strip spans both columns underneath. Below that width the order changes to verdict and checklist first, then the player (capped at 360px), then the strip. The direction contract planned a 380px player column; the build uses 300px, and this record follows the build.
- **Run in progress:** a player column from 280 to 360px sits beside the six-step pipeline list.
- Tables scroll horizontally inside their card instead of squeezing, with minimum widths of 720 to 760px.

## Elevation & Depth

The system is flat by default and uses tonal layering: white cards on a cool ground, separated by 1px hairlines. A very soft resting shadow (shadow-1) lifts cards and buttons just enough to read as objects. The deeper shadow (shadow-2) belongs to the video player and nothing else. The sticky header is the only translucent surface (white at 90% with a small backdrop blur).

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgb(14 17 22 / 0.06), 0 1px 1px rgb(14 17 22 / 0.03)`): cards, tables, the term checklist, and primary and secondary buttons.
- **Player** (`box-shadow: 0 8px 24px -8px rgb(14 17 22 / 0.18), 0 2px 6px rgb(14 17 22 / 0.06)`): the 9:16 video frame only.

### Named Rules
**The One Heavy Object Rule.** Only the video player casts a real shadow. Cards rest at shadow-1 or less, and nothing changes elevation on hover.

## Shapes

Corners are gently rounded and scale with the size of the object: 2px for swatches and look-alike stretches, 3px for overlay boxes and their labels, 6px for the strip, nav items and small hover targets, 8px for buttons, inputs and notes, and 10px for cards and the player. Pills (badges, status, suggestion chips, step dots and the mix bar) are fully round. Borders are 1px hairlines. A dashed line means one of two things: a rejected look-alike (fail red) or a drop or window region (the upload well in line-strong, the term window in ink-3). Diagonal hatching appears only on the strip, at 135°, to mark a term window (ink at 7%) or a look-alike stretch (fail at 16%).

## Components

### Buttons
- **Shape:** 8px corners.
- **Primary:** an ink fill with white 14px medium text and 8px by 14px padding. Rest shadow, and an optional 16px icon before the label with a 6px gap. Hover shows ink at 90%. Disabled is 60% opacity, and busy states change the label ("Creating…", "Starting…").
- **Secondary:** a white fill, a hairline border and ink text with rest shadow. Hover moves the border to line-strong. Used for Export CSV.
- **Focus:** a 2px focus-blue outline with a 2px offset on every interactive element.

### Chips
- **Suggestion chips:** a pill with a hairline border, 12px ink-2 text and 2px by 10px padding. Hover changes the border to line-strong and the text to ink. Used to append an example contract term.
- **Preview chip:** a sunken pill with 11px ink-3 text.

### Verdict and status pills
- **Verdict badge:** a pill with a soft verdict wash and full-strength verdict text in 12px semibold, with a 14px lucide icon (check, x or circle-help). The large variant (15px, 4px by 12px padding, 16px icon) leads the video report.
- **Progress pill:** sunken fill, ink-2 text and a spinning loader, showing the current step name.
- **Stopped pill:** a fail wash with a warning-triangle icon. A plain-language reason in 12px ink-3 sits under it.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** surface on ground.
- **Shadow Strategy:** Rest (see Elevation & Depth).
- **Border:** a 1px hairline, with hairline dividers between rows.
- **Internal Padding:** 16px across, 12px down per row. Notes are 8px by 12px on an unsure or fail wash at 8px corners.

### Inputs / Fields
- **Style:** a white fill, a hairline border, 8px corners and 8px by 12px padding. Placeholders are ink-3 and the caret is focus blue. Labels sit above in 14px medium, with an optional 13px ink-3 hint.
- **Hover / Focus:** hover moves the border to line-strong. Focus shows the global focus-blue outline.
- **Error:** a fail note below the form (fail wash, fail text, 8px corners).

### Navigation
- **Header:** sticky, 52px tall, a white surface at 90% with a blur and a bottom hairline. The wordmark sits at the left, then text nav links (ink-2, 6px by 10px padding, 6px corners, sunken fill and ink text on hover). The Meta and Aetrai credit line in 12px ink-3 is hidden below 640px.
- **Breadcrumbs:** 13px ink-3 with slash separators. Links turn ink and underline on hover.
- **Wordmark:** a 24 by 16px glyph of the strip itself (an ink tile with 4px corners, a lime stretch and a white playhead through it), followed by "Screen-Time" in Geist semibold at 15px (17px on the landing page). The same glyph is the favicon (src/app/icon.svg). The mark is a picture of the measurement, which is why lime is allowed in it.

### Contract term row
A full-width button laid out as a three-column grid: a 24px round verdict dot (wash plus icon), the term text in medium with the detail line in ink-2, and a right-aligned 12px "Jump to 0:02.6" or "See the first 5 s" action. Hover and focus fill the row with sunken and draw the term's window and evidence on the strip. Clicking seeks the player to the proving second.

### Pipeline steps
Six rows, each with a 24px round step dot. Done steps get a pass wash and check, the active step gets an ink fill with a white spinner, a stopped step gets a fail wash and x with its reason note indented below, and pending steps get a sunken dot with an ink-3 number.

### Video overlay player
A 9:16 ink frame with 10px corners and the player shadow, showing native controls. Boxes follow the decoded frame. A counted product gets a 2px lime border with a faint ink halo and a lime "Brand product" label. A rejected object gets a 2px dashed fail border and a fail label with white text.

### Screen-time strip (signature)
A time ruler that every number on the report points back to.
- **Track:** 44px tall, sunken, 6px corners and a hairline border, with an ew-resize cursor. It is a slider: click or drag to seek, and use the arrow keys to step one frame (shift steps one second).
- **Segments:** full-height lime blocks for on-screen stretches, at least 2px wide.
- **Mention ticks:** 3px violet bars covering the bottom half with a rounded top. In the mini strip they run full height.
- **First-seen mark:** a lime-ink downward notch (10px wide, 6px deep) at the top edge.
- **Longest-run underline:** a 3px lime-ink bar under the longest stretch.
- **Look-alike stretches:** inset 4px top and bottom, with a dashed fail border and fail hatching. These are not counted.
- **Term window:** ink hatching inside a dashed ink-3 outline, drawn while a term row is hovered or focused. The term's evidence gets a 2px inset ink outline.
- **Playhead:** a 2px ink line with an 8px ink dot at the top.
- **Ruler:** 11px Geist Mono ink-3 labels below the track, placed at 1, 2, 5, 10, 15, 30 or 60 s steps to fit roughly one label per 70px.
- **Legend and readout:** 12px legend swatches (lime, violet, dashed fail, dashed ink-3) on the left and the live mono timecode on the right.
- **Mini variant:** 10px tall with no border, ruler or marks. Used in the roll-up table and mobile list.

### Mix bar
An 8px-tall, 160px-wide pill track in sunken, split into pass, fail and unsure portions, with a "7 / 5 / 0" tabular count. In-progress and stopped counts are added as ink-3 text.

## Do's and Don'ts

### Do:
- **Do** open every report on the verdict and its terms. The measurement sits underneath, never above.
- **Do** reserve lime for on-screen seconds (segments, counted boxes, the total swatch) and lime-ink for the marks drawn on lime data.
- **Do** make every figure that refers to a moment seekable: a button or row that moves the player to that second.
- **Do** show rejected look-alikes and not-checkable terms explicitly, dashed in fail red or as amber "Needs review".
- **Do** use tabular figures for every number, right-aligned in table columns.
- **Do** use Geist Mono only for m:ss.s timecodes.
- **Do** keep progress and loading in ink and neutral greys.

### Don't:
- **Don't** use lime for status, progress, buttons, highlights or selection.
- **Don't** use a verdict colour for anything that is not a judgement or a step outcome.
- **Don't** build hero metrics or rows of same-size stat cards. Figures sit inline or in the compact roll-up sidebar.
- **Don't** add shadows beyond rest and player, or lift cards on hover.
- **Don't** introduce new hues. The palette is ink, neutrals, lime, violet, the three verdict tones and focus blue.
- **Don't** set durations or counts in Geist Mono.

## Landing page (src/app/page.tsx)
Persuade mode in the same world: the same ground, type and colour roles, with its own brief at `.impeccable/surfaces/src-app-page.md`.
- **Hero:** the H1 and an intro that names the three Meta models, an ink primary button and a white secondary one. No eyebrow pill.
- **Live replay (signature on the landing page):** a real report replayed muted and looping in a white card (shadow-1; the player inside keeps the one heavy shadow). The strip fills only up to the playhead, the counter adds up detected frames as they play, each tracked object appears with its crop when first seen (counted in pass, rejected in a fail-soft card), and contract terms tick from a dashed circle to their verdict at the moment they are earned.
- **How it works:** a pipeline list, not cards: 24px sunken step dots with a Geist number, joined by a hairline (down the left on a phone, across the top on a wide screen); the model name sits under each step in ink-3.
- **Verdicts:** real Muse Spark crops with pass or fail pills and the model's quoted reason.
- **Accuracy:** the figures in a 20px sentence, then a compact evidence table (tabular, right-aligned) that includes the weakest rows and links to every result. No hero metric row.
- **Share card:** src/app/opengraph-image.tsx: the mark, the H1 and a strip.
