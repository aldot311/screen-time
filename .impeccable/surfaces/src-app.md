---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: Screen-Time app (campaigns, run status, video report)

Scope: the working app at src/app (campaign list, new campaign, campaign roll-up, video report with run status). Mode: Operate.
Audience and job: a brand or agency manager deciding whether each creator delivered the sponsored exposure, before paying.
Constraints: light, clean data-dashboard feel pinned by Aldo ("like Linear or Stripe"); hackathon judges see it live and in a 3-minute video; every number links to the second that proves it; look-alike rejections and uncheckable terms are shown honestly.
Direction source: pinned by the user (category standard at Linear/Stripe craft level); no concept roll. Build path: code-led (no image generation in this harness).

## Direction contract
THESIS: Proof, not views. A report is a verdict with its evidence attached, not a dashboard to interpret. Refuses the hero-metric template and same-size stat cards.
OWN-WORLD: Cool paper-white ground (#F7F8FA) with ink #0E1116, hairline borders #E3E6EB, one committed signal: highlighter lime (#C8F031) marking every second the product was on screen, wherever it appears (timeline, overlay box, table bars). Mentions in violet #6E56CF. Verdicts: pass #127A4B, fail #C2362F, not checkable #9A6B00. Geist for UI, Geist Mono only for timecodes and figures. Dense, aligned, 8px rhythm.
STORY: The manager sees each creator's verdict first, opens one video, plays it with the product boxed, sees the lime screen-time strip under the player, clicks a failing term, and lands on the exact second.
FIRST VIEWPORT: Video report: left 380px column holds the 9:16 player with live overlay boxes; right column leads with the verdict line (Delivered / Fell short / Needs review: a delivery verdict; the pay decision stays with the manager, who acts on it) and the contract checklist; under both, full-width, the screen-time strip with lime on-screen segments, violet mention ticks, first-seen and longest-run marks, dashed look-alike stretches and the playhead. On a phone the verdict and checklist come before the player.
FORM: pinned category standard (Linear/Stripe), position 1 of 1, seed key: none (user-pinned direction, concept-seed skipped).
SIGNATURE: the highlighter strip: a time ruler where lime marks on-screen seconds, synced both ways with the player; contract terms draw their window on it on hover.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
