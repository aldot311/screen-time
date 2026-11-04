# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Brand and influencer-agency managers who pay creators for sponsored videos. Their job: before paying (or renewing) a
creator, check whether the product was actually seen in the video as the contract promised, and have evidence they can
show the creator or their boss.

## Product Purpose

Screen-Time measures how long a brand's product is actually on screen in creator video and checks it against the
sponsorship contract. A brand describes its product in plain words, adds the creator videos and the contract terms, and
gets a per-video and per-campaign report: seconds on screen, how big and central it was, spoken mentions, and pass/fail
on each contract term with a jump to the exact second as proof. Success: a manager can decide "pay / don't pay / ask for
a fix" from one page in under a minute, and trust it.

## Positioning

Proof, not views: "Type what your product looks like; get second-by-second proof it was seen, checked against your
contract." Sponsorship-analytics vendors (Blinkfire, Relo Metrics, Zoomph, Talkwalker) detect logos from fixed
libraries, mostly in sports broadcasts, or report engagement; Blinkfire also breaks down a brand's time on screen in
social video. Creator-video checkers exist too (README, "Who else checks creator videos", read 2026-11-03): OnBriefing
checks published videos against a pasted brief, Cohley's AI Asset Analysis checks submitted UGC against brief rules,
Keepface and Omnicom's Creo run AI reviews of deliverables, CreatorIQ's SafeIQ flags brand-safety issues with
timestamps, and Vidmob scores ads on brand-early and brand-share criteria. Screen-Time's difference is narrower: it
tracks one product from a text prompt (Meta SAM 3.1, no training) and counts its seconds on screen, rejects same-brand
look-alikes against a product photo (Muse Spark), listens for the brand name (Muse Voice Transcribe), and turns
contract terms into checkable rules with timestamped evidence. Never call it the first or the only one.

## Operating Context

- Built Oct 28 – Nov 4, 2026 by Aldo Tile (Aetrai), with Claude Code as the coding assistant, for the Meta Global AI
  Developer Hackathon (Oct 26 – Nov 4), startup track, problem statement "Build for Your World". Judged on impact,
  creative use of Meta models, technical depth, and a working demo plus a 3-minute video. Judges must see an agent
  working over video, not a "simple image analyzer".
- A manager reviews a campaign: several creators, each with one or more short vertical videos (Reels/TikTok style,
  10–60 s).
- Runs take tens of seconds per video (upload, tracking, verification, transcription).

## Capabilities and Constraints

- Pipeline: normalize to 15 fps → SAM 3.1 text-prompt tracking → Muse Spark look-alike check → Voice Transcribe
  mentions → metrics → contract terms parsed by Muse Spark into typed rules, checked in code.
- Data shape: `src/lib/types.ts` (`VideoReport`, `VideoMetrics`, `TermResult`).
- Metrics: seconds on screen, share of video, first seen, longest continuous run, average share of frame, centre
  weighting, prominence 0–100, mentions; contract kinds: total seconds, seconds within first N s, continuous run,
  minimum frame share, spoken mentions, first-seen-before.
- Every paid API call goes through a cost guard with per-run and total caps.
- Public repository; no secrets in code. Videos must be ones we have rights to.
- Not built for the hackathon: accounts/teams, billing, social-platform scraping, dollar value per appearance (pitch only).

## Brand Commitments

Product name "Screen-Time", by Aetrai (aetrai.com). No other binding brand assets yet.

## Evidence on Hand

- The LaCroix Reels: 11 vertical Reels for a LaCroix Strawberry Peach test campaign run by Aetrai. 8 friends filmed 9
  of them and the builder filmed the 2 look-alike clips; we burned in the captions from each Reel's own speech. Every
  friend shown agreed to be shown publicly. LaCroix and Poppi are not involved (src/lib/campaign/demo-note.ts). They
  are the live site's main content (campaign `lacroix-strawberry-peach`) and the accuracy set. They are not in this
  repo; the demo video (public/demo.mp4) and its poster show some of the friends.
- Aldo's own 15 test clips (Alani Nu can, Stanley tumbler, New Balance sneaker, a coconut-water look-alike, a no-product
  clip) and 6 Pexels stock clips: the earlier test set. Their campaigns are archived: kept in the store but hidden from
  the live site (`src/lib/campaign/visibility.ts`). Their scores stay in `docs/ACCURACY.md`.
- Answer-key labels: the LaCroix Reels in `data/labels/lacroix/` (two independent vision passes, kept where both
  agree); the earlier 23 clip/product targets in `data/labels/` (two passes; no person's check is recorded in them).
- No customers, testimonials or pricing yet: never invent them. Accuracy numbers come only from `pnpm accuracy` on
  real runs (`src/lib/accuracy-data.json`).

## Product Principles

1. Every number links to the moment that proves it.
2. Show what was rejected and why (look-alikes), not only what passed.
3. A verdict a manager can act on beats a dashboard to interpret.
4. Honest about uncertainty: "not checkable" and partial results are shown as such, never as passes.
