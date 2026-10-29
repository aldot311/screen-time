# Screen-Time

**Proof your product was seen.** Brands pay creators for screen time they cannot check. Screen-Time watches every
frame of a sponsored video, boxes the brand's product, rejects look-alikes, hears the brand name, and checks the
sponsorship contract to the second.

Built on Meta's Model API (SAM 3.1, Muse Spark and Muse Voice Transcribe) for the Meta Global AI Developer Hackathon,
startup track, by Aetrai. Everything in this repo was built during the hackathon, starting Oct 28, 2026.

## What it measures

Measured on real runs against checked labels, frame by frame at 15 fps
([docs/ACCURACY.md](docs/ACCURACY.md)):

| | |
|---|---|
| Precision | **97.7%**: when it says the product is on screen, it is |
| Recall | **95.6%** of the frames the product was really there |
| F1 | 96.6% |
| Test set | 20 labelled vertical clips (three show two products), 23 clip/product targets, including a look-alike can and a clip with no product (both correctly 0 s) |
| Cost | SAM 3.1 at $0.20 per 1,000 frames; a 12–15 second Reel cost $0.10–0.15 all in on our runs, including a prompt retry |

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
   On the labelled objects it scores 35 of 37 against hosted Spark's 37 of 37, with no look-alike counted
   ([docs/ACCURACY.md](docs/ACCURACY.md)).
4. **Prompt recovery (agentic).** If nothing SAM tracked is the product, Muse Spark looks at frames from the video.
   If the product is there, it names it the way SAM is likelier to find it, and SAM runs once more. On our test
   clips "tumbler" found nothing; Spark suggested "cup", and the second pass found the Stanley for 10.1 s. For a clip
   without the product, Spark says so, and there is no second paid pass.
5. **Listen.** Voice Transcribe timestamps each spoken turn; brand names are matched to the second.
6. **Measure.** Seconds on screen, share of video, first seen, longest continuous run, size in frame and a 0–100
   prominence score.
7. **Contract.** The brand writes terms in plain English ("on screen at least 2 seconds within the first 5 seconds").
   Muse Spark turns each into a typed rule (structured output). Code checks the rule to the frame and returns
   pass/fail with the moments that prove it.

**The report** is a verdict first: Delivered, Fell short, or Needs review. It has a player with SAM's boxes drawn
live (lime is counted, dashed red is rejected), a screen-time strip synced both ways with the player, and contract
terms that jump to their evidence. Campaigns roll up across creators, with CSV export.

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

From the command line:

```bash
pnpm run-clip --prompt "drink can" --product "a slim teal Alani Nu can with a peach graphic" \
  --brand Alani --term "On screen at least 3 seconds in total" --max-usd 0.50 path/to/clip.mp4
pnpm accuracy          # precision/recall of data/out against data/labels
pnpm import-runs       # show CLI runs in the app
pnpm test              # 250 tests, no live API calls
```

## Layout

- `src/lib/meta`: Model API client (Files, Responses with SSE, transcription), retries, cost guard
- `src/lib/sam`: SAM stream → tracks and per-frame detections (via `@meta-sam/parser`)
- `src/lib/pipeline`: the run, prompts and structured-output schemas
- `src/lib/metrics`: screen time, prominence, mentions, contract rule checks, accuracy maths
- `src/lib/campaign`: campaigns, videos, storage (local or Vercel Blob), runner
- `src/app`: landing page, campaigns, reports; `src/components`: player overlay, screen-time strip
- `docs/`: [spec](docs/SPEC.md), [plan](docs/PLAN.md), [verified API notes](docs/meta-api-notes.md),
  [accuracy](docs/ACCURACY.md)

## Licence

MIT. See [LICENSE](LICENSE).
