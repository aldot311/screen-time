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
contract." Competitors (Blinkfire, Relo Metrics, Zoomph, Talkwalker) detect logos from fixed libraries, mostly in sports
broadcasts, or report engagement. Screen-Time tracks any product from a text prompt (Meta SAM 3.1, no training), rejects
look-alikes with a second model (Muse Spark), listens for the brand name (Muse Voice Transcribe), and turns contract
terms into checkable rules with timestamped evidence.

## Operating Context

- Built for the Meta Global AI Developer Hackathon, startup track (Aetrai), Oct 28 – Nov 4, 2026. Judged on impact,
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

- Aldo's own 15 test clips (Alani Nu can, Stanley tumbler, New Balance sneaker, a coconut-water look-alike, a no-product
  clip) and 6 Pexels stock clips; allowed in the demo and on the live site. Aldo will film more polished demo videos
  once the product is built.
- Answer-key labels for 23 clip/product targets in `data/labels/` (two independent vision passes, human spot-check).
- No customers, testimonials, pricing or accuracy numbers yet: never invent them. The accuracy number comes only from
  `pnpm accuracy` on real runs.

## Product Principles

1. Every number links to the moment that proves it.
2. Show what was rejected and why (look-alikes), not only what passed.
3. A verdict a manager can act on beats a dashboard to interpret.
4. Honest about uncertainty: "not checkable" and partial results are shown as such, never as passes.
