# Screen-Time

**Proof your product was seen.** Brands pay creators for screen time they cannot check. Screen-Time watches every
frame of a sponsored video, boxes the brand's product, rejects look-alikes, hears the brand name, and checks the
sponsorship contract to the second.

Built on Meta's Model API (SAM 3.1, Muse Spark and Muse Voice Transcribe) for the Meta Global AI Developer Hackathon,
startup track, by Aetrai. Everything in this repo was built during the hackathon, starting Oct 28, 2026.

## Try it

Live at https://screen-time-inky.vercel.app. The main campaign uses real Reels: friends filmed them for a LaCroix
Strawberry Peach test campaign, and every report on the site is the stored result of a full run. Judges can start at
[/judge](https://screen-time-inky.vercel.app/judge): five steps through a live sample run, a pay case, a hold case,
the accuracy page and the follow-up agent.

- No password: the sample run, the example reports, and the follow-up agent on those reports. The sample run and the
  agent are capped per visitor and per day. Past a cap, you see the newest finished run instead.
- Demo password (in the submission notes): saving a campaign, checking your own video, and approving the re-cut link
  the agent queues. That link is a real upload link for the creator.

## What it measures

Measured on the 11 LaCroix test Reels as delivered on the site (9 people; 1,931 frames with the can in 2,800), scored
from the site's own run reports (data/runs) frame by frame at 15 fps against labels drafted by two independent Claude
vision passes (George's on our earlier zoomed edit of his Reel). No person has checked the labels yet (0 of 11 clips;
/label records a check). Details, intervals and the reproduce command (`pnpm accuracy --labels data/labels/lacroix`) are in [docs/ACCURACY.md](docs/ACCURACY.md):

| | SAM 3.1 alone | SAM 3.1 + Muse Spark (what the app reports) |
|---|---|---|
| Precision | 95.0% | **98.4%** (95% interval 96.7–99.6%) |
| Recall | 99.3% | **91.1%** (70.3–100.0%) |
| F1 | 97.1% | **94.6%** |
| Seconds counted on the look-alike Reel | 4.2 s | **0.0 s** |

- What Muse Spark adds: it rejected both look-alikes SAM alone counts (a LaCroix Pamplemousse can, a different flavor,
  and a Poppi can). Per frame, nearly all of the precision gain is the one look-alike Reel, which the builder filmed.
  It costs recall on George's Reel: Muse Spark could not confirm his small can, so it counted 0 s against 11.2 s
  labelled, held the fee and flagged the report. Object by object, hosted Muse Spark is right on 11 of 12 objects,
  SAM alone on 10 of 12.
- Where it is wrong: George's Reel (above); and Michael's Reel (not Michael K's), counted 3.0 s where the labels say
  2.6 s, so it said pay against a 3 s term where the labels say hold (it flagged the report as close). Pay or hold
  agrees with the labels on 9 of 11 Reels.
- Until Nov 4 the published figures scored a zoomed edit of George's Reel that we made (2.3x, following the can); they
  now score the Reel as delivered.
- Cost: $0.106–0.230 of Meta API per Reel on these runs ($1.56 for all 11), with the product photo and
  transcription. SAM 3.1 is $0.20 per 1,000 frames; Muse Spark and Voice Transcribe are counted at the fixed amount
  the budget reserves per call, not the billed amount.
- An earlier test set of 20 clips the builder filmed himself or took from Pexels (2026-10-28: precision 97.7%,
  recall 95.6%) is kept in [docs/ACCURACY.md](docs/ACCURACY.md); its campaigns are archived and hidden from the site.

## How it works

```
upload ──▶ normalize ──▶ track ──▶ verify ──▶ listen ──▶ measure ──▶ contract
           ffmpeg 15fps   SAM 3.1   Muse Spark  Voice       metrics      Muse Spark
                            ▲          │       Transcribe               + rule code
                            └──────────┘
                     prompt recovery (Muse Spark)
```

1. **Normalize.** ffmpeg re-encodes to 15 fps, so frame ÷ 15 is an exact second.
2. **Track.** SAM 3.1 follows every object matching a short prompt ("drink can") through the video, with a box and
   mask per frame.
3. **Verify.** Muse Spark looks at crops of each tracked object (first, middle and largest appearance) and decides
   whether it is the brand's product, a look-alike, or unclear. Only matches count, and every rejection carries
   its reason. A campaign can switch this check to Meta's open-weight **Muse Spark Open**, served by Fireworks
   (the run receipt names the model and host; if the host fails, hosted Muse Spark checks that object instead).
   On the 12 labelled objects from the LaCroix Reels it scores 10 of 12 against hosted Spark's 12 of 12, with no
   look-alike counted ([docs/ACCURACY.md](docs/ACCURACY.md)).
4. **Prompt recovery (agentic).** If nothing SAM tracked is the product, Muse Spark looks at frames from the video.
   If the product is there, it names it the way SAM is likelier to find it, and SAM runs once more. On the earlier
   test clips "tumbler" found nothing; Spark suggested "cup", and the second pass found the tumbler for 10.1 s. For a
   clip without the product, Spark says so, and there is no second paid pass.
5. **Listen.** Voice Transcribe timestamps each spoken turn; brand names are matched to the second.
6. **Measure.** Seconds on screen, share of video, first seen, longest continuous run, size in frame and a 0–100
   prominence score.
7. **Contract.** The brand writes terms in plain English ("on screen at least 2 seconds within the first 5 seconds").
   Muse Spark turns each into a typed rule (structured output). Code checks the rule to the frame and returns
   pass/fail with the moments that prove it.

**The report** is a verdict first: Delivered, Fell short, or Needs review. It has a player with SAM's boxes drawn
live (lime is counted, dashed red is rejected), a screen-time strip synced both ways with the player, and contract
terms that jump to their evidence. Campaigns roll up across creators, with CSV export.

**The follow-up agent** is Muse Spark with tools, working on one creator's video. It reads the report and the
creator's other videos, can re-check a re-cut, drafts the note to the creator and makes a pay/hold call. It never
sends anything: a re-cut request waits for the brand to approve it, and the note is a draft. Every turn goes through
the cost guard, and the number of turns is capped.

## Cost safety

Every billed call reserves its cost in a ledger before it is made, and settles against the billed usage after.
A per-video cap and a total cap are enforced atomically, so concurrent runs cannot overspend together. A recovery
retry runs only when the budget still covers it and the rest of the run.

## Run it

Needs a current Node.js and pnpm. ffmpeg comes from `ffmpeg-static`.

```bash
pnpm install
cp .env.example .env.local   # then set META_MODEL_API_KEY
pnpm dev                     # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `META_MODEL_API_KEY` | Meta Model API key (required for runs) |
| `OPEN_BASE_URL`, `OPEN_MODEL`, `OPEN_API_KEY` | An OpenAI-compatible host for Muse Spark Open (optional; turns on the campaign's open-weight switch). `OPEN_PROVIDER` names the host on receipts; on OpenRouter, `OPEN_PROVIDER_ONLY=fireworks` pins the provider |
| `SCREEN_TIME_PASSWORD` | 12+ characters; required in production for any change (create, upload, run) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store; without it, data lives in `data/store` |
| `SCREEN_TIME_LINK_SECRET` | Random, 32+ characters (`openssl rand -base64 32`); signs "request video from creator" links. Without it in production, request links are off |
| `BLOB_STORE_HOST` | The store's public host (`<id>.public.blob.vercel-storage.com`); needed for newer Blob tokens, which do not contain the store id |
| `SCREEN_TIME_MAX_USD_PER_VIDEO` / `SCREEN_TIME_MAX_USD_TOTAL` | Spend caps (default $0.50 / $20) |
| `SCREEN_TIME_TRY_PER_VISITOR` / `SCREEN_TIME_TRY_PER_DAY` | Sample runs without the password, per visitor and for everyone per day (default 3 / 25) |
| `SCREEN_TIME_AGENT_PER_VISITOR` / `SCREEN_TIME_AGENT_PER_DAY` | Follow-up agent runs without the password on the example reports (default 3 / 20) |
| `SCREEN_TIME_SHOW_ARCHIVED` | Scripts only: `1` reads the archived campaigns again. Never set it on the site |

From the command line:

```bash
pnpm run-clip --prompt "drink can" --product "a pink LaCroix Strawberry Peach sparkling water can" \
  --brand LaCroix --brand "La Croix" --term "On screen at least 3 seconds in total" \
  --target lacroix-can --product-photo product.jpg --max-usd 0.50 path/to/reel.mp4
pnpm accuracy data/out --labels data/labels/lacroix   # precision/recall against the LaCroix labels
pnpm import-runs       # show CLI runs in the app
pnpm test              # 447 tests, no live API calls
```

The friends' Reels are not in this repo, since they show people's faces. `scripts/build-lacroix.mts` builds the
campaign from a folder that holds them.

## Layout

- `src/lib/meta`: Model API client (Files, Responses with SSE, transcription), retries, cost guard
- `src/lib/sam`: SAM stream → tracks and per-frame detections (via `@meta-sam/parser`)
- `src/lib/pipeline`: the run, prompts and structured-output schemas
- `src/lib/metrics`: screen time, prominence, mentions, contract rule checks, accuracy maths
- `src/lib/campaign`: campaigns, videos, storage (local or Vercel Blob), runner, archived campaigns
- `src/lib/agent`: the follow-up agent (Muse Spark tool calling) and its limits without the password
- `src/app`: landing page, /judge, campaigns, reports, /accuracy; `src/components`: player overlay, screen-time strip
- `docs/`: [spec](docs/SPEC.md), [plan](docs/PLAN.md), [verified API notes](docs/meta-api-notes.md),
  [accuracy](docs/ACCURACY.md)

## Licence

MIT. See [LICENSE](LICENSE).
