# Screen-Time: build plan (Oct 28 – Nov 4, 2026)

API facts come from docs/meta-api-notes.md. Submission deadline: Wed Nov 4, 9:00 PM ET.

## Architecture
- **App:** Next.js (TypeScript) on Vercel. Videos and results are stored in Vercel Blob, and campaign and run state as
  JSON documents. There is no database: at hackathon scale a JSON document per campaign is enough.
- **Pipeline (one serverless function per video, Node, ffmpeg-static):**
  1. **Normalize:** ffmpeg to H.264 MP4, longest edge 960 px, a constant 15 fps, faststart. At a fixed fps, frame
     index ÷ 15 is exact seconds (SAM output carries no timestamps), and it halves SAM cost against 30 fps.
  2. **Track:** upload to the Meta Files API, then call `sam-3.1` with the campaign's noun phrase, streamed. Use the
     official `@meta-sam/parser` to get the boxes and masks for each frame and object.
  3. **Verify:** for each track, crop 3 frames (start, middle, best). `muse-spark-1.3` with structured output judges
     whether it is the brand's product or a look-alike, and how visible it is (clear, partial or blurred). Tracks that
     fail are dropped and reported as "look-alike rejected", which shows the agent catching mistakes in the demo.
  4. **Listen:** extract 16 kHz mono WAV, then `muse-voice-transcribe-1.0` in ENDPOINTING mode gives turns with
     timestamps. Find brand mentions in the transcript, with Muse Spark handling fuzzy matches.
  5. **Measure (plain code, unit-tested):** seconds on screen, longest continuous run, share of frame from mask area,
     centre and edge weighting, first-seen time, and a prominence score.
  6. **Contract terms:** the brand writes terms in plain English. Muse Spark turns each one into a typed rule
     (structured output), the rule is checked in code, and the result is pass or fail with timestamped evidence.
- **Report UI:** a video player with the mask overlay, a timeline strip of on-screen segments and mentions, proof
  moments you click to jump to the exact second, a contract checklist, a campaign roll-up across creators, and CSV
  export.
- **Cost guard:** count frames before every SAM call and refuse a run that would go over a set budget for each run
  and in total. Usage is logged from `usage.video_frames_processed`.

## Why this scores
- **Use of Meta tooling (25%):** four Meta models in one pipeline (SAM 3.1, Muse Spark, Voice Transcribe, plus Muse
  Code for one module). SAM concept prompts find unbranded products, and Spark checks SAM's matches.
- **Impact (30%):** brands spend billions on creators and cannot see delivery. It produces a real report a brand can
  act on.
- **Technical depth (20%):** exact frame-to-time mapping, mask-based prominence, a verification step, typed contract
  rules, tests, and a measured accuracy number.
- **Demo (25%):** a live upload during the video, the overlay playing back, and a contract term failing with the
  evidence clip.

## Days
- **Wed Oct 28:** scaffold, API client, cost guard; a SAM probe on one clip (about 1 cent); parser and metrics tests.
- **Thu Oct 29:** the full pipeline from the command line on Aldo's clips: track, verify, listen, measure, JSON report.
- **Fri Oct 30:** contract terms; label the test set; first accuracy run.
- **Sat Oct 31:** web app: upload, run status, report page with overlay and timeline.
- **Sun Nov 1:** campaign roll-up, CSV, design pass, preview deploy.
- **Mon Nov 2:** accuracy tuning, edge cases, README with numbers, Muse Code module.
- **Tue Nov 3:** production deploy (with Aldo's OK), record the demo, fix what the demo shows.
- **Wed Nov 4:** final video, submit before 6 PM ET (3-hour buffer), post on X.

## Verification
- Unit tests for the parser adapter, metrics and rule checks, using recorded API fixtures (no live calls in tests).
- An end-to-end accuracy script over the labelled clips, reporting per-second precision and recall.
- A browser pass on the deployed preview before recording.
