# Screen-Time: spec

Built for the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026), startup track, theme "Push the Frontier".
All code in this repository was written during the hackathon, starting Oct 28, 2026.

## Problem
Brands pay creators for sponsored videos and get back views and likes. Nobody tells them whether their product was
actually seen: how many seconds it was on screen, how big, whether it was in focus, whether the creator mentioned it.
Agencies check this by scrubbing videos by hand.

## What it does
1. A brand creates a campaign: a plain-language description of what to look for ("the blue Stanley cup", "a Liquid
   Death can") and optional contract terms ("product on screen ≥ 3 s in the first 10 s", "said aloud at least once").
2. It adds creator videos (upload, or a link to a video the brand has rights to).
3. An agent runs each video through the pipeline:
   - SAM 3.1 (Meta Model API) segments and tracks the described object through every frame from the text prompt.
   - Muse Voice Transcribe produces a timed transcript; mentions of the product are found in it.
   - Muse Spark checks each detected appearance against the description (is it really the brand's product, not a
     look-alike?), and judges context and brand safety.
   - Deterministic code turns tracks into metrics: seconds on screen, share of frame, centre vs edge, first-seen time,
     longest continuous run, mention times.
   - Contract terms are checked and each one gets pass/fail with the timestamp evidence.
4. The report: per video and per campaign, with a timeline strip, timestamped proof moments that jump the player to
   the exact second, contract-term results, and CSV export.

## Not a "simple image analyzer"
The hackathon bans simple image analyzers and sports analyzers. Screen-Time is a multi-step agent over video: tracking
across time, audio, verification and contract reasoning combined into one auditable report. The demo has to show this.

## Success metrics (measured, reported in the README and the video)
- Precision and recall of on-screen seconds against hand-labelled clips (target set: ≥ 20 clips, labelled per second).
- Contract-term verdict accuracy on the same set.
- Cost and wall-clock time per minute of video.

## Out of scope for the hackathon
Billing, multi-user accounts and teams, social-platform scraping, a dollar value per appearance (pitched, not built).

## Constraints
- Uses only videos we have rights to: clips Aldo films himself and freely licensed stock footage.
- Public repository. No secrets in the repo; the API key comes from the environment.
- API budget: $150 of Meta credits, with a spend limit set on the Meta Billing page.
