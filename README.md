# Screen-Time

**Proof your product was seen.** Brands pay creators for screen time. Screen-Time measures it against the contract:
it tracks the brand's product through every frame of a sponsored video, rejects look-alikes, hears the brand name, and
checks on-screen terms frame by frame.

Problem statement: **Build for Your World**. Before a brand pays a creator for a sponsored Reel, Screen-Time checks the
delivered video against the deal's terms and shows the moment behind each verdict.

Built by Aldo Tile (Aetrai) for the Meta Global AI Developer Hackathon, startup track, on Meta's Model API (SAM 3.1,
Muse Spark and Muse Voice Transcribe). Everything in this repo was built during the hackathon, Oct 28 – Nov 4, 2026,
with Claude Code as the coding assistant: most commits carry its `Co-Authored-By` line.

## Try it

Live at https://screen-time-inky.vercel.app. The main campaign is a LaCroix Strawberry Peach test campaign run by
Aetrai on real Reels: 8 friends filmed 9 of the 11 Reels, the builder filmed the 2 look-alike clips, and we burned in
the captions from each Reel's own speech ([Rights](#rights)). Ash's "re-cut" is her other take, filmed the same day
and uploaded after her first. Michael K's Reel came in through his request link, uploaded on his behalf for the demo
recording. Every report on the site is the stored result of a full run. Judges can start at
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

## Who else checks creator videos

Brands already check creator videos, by hand and with tools. What each source says, as read on 2026-11-03:

- [HypePipe's blog](https://hypepipe.ai/blog/why-influencer-compliance-is-still-manual/) describes managers who "watch
  videos, scan captions, verify hashtags, check post dates".
- [OnBriefing](https://onbriefing.com/) checks published TikToks, Reels and Shorts against a pasted brief and gives the
  second of each miss ($20 a month for 200 video-minutes, checked 2026-11-03). Its "Product on screen" check asks
  whether the product appears. Its [sample report](https://onbriefing.com/sample-report) read 8 frames of a 37-second
  video, for a brief with no product-on-screen rule.
- [Cohley's AI Asset Analysis](https://cohleybrandresource.freshdesk.com/support/solutions/articles/48001276120-non-negotiables-and-ai-asset-analysis)
  checks submitted UGC video and its transcript against brief rules such as "#sponsored within the first 5 seconds".
- [Keepface](https://help.keepface.ai/brand/content-ai/content-review-ai) and Omnicom's
  [Creo](https://www.nasdaq.com/press-release/creo-debuts-ai-solution-real-time-creator-content-editing-reducing-costs-and-time)
  run AI reviews of submitted deliverables.
- [CreatorIQ's SafeIQ](https://www.creatoriq.com/brand-safety) flags brand-safety issues with timestamps.
- [Blinkfire](https://analyticsblog.blinkfire.com/blog/2023/08/02/blinkfires-post-analytics-for-better-insights/)
  breaks down a brand's time on screen in social video for sponsors.
- [Vidmob](https://help.vidmob.com/en/articles/6519983-what-criteria-are-available-for-creative-scoring) scores ads on
  brand-early and brand-share criteria.
- [Mixpeek](https://mixpeek.com/use-cases/brand-safety-verification) sells a developer API that matches logos and
  products in sampled video frames against reference images.
- YouTube's [brand pulse report](https://blog.google/products/ads-commerce/youtube-new-brand-pulse-report/) finds a
  brand's logos, product shots and mentions across YouTube, a creator's passing use included, for select advertisers.

Screen-Time's difference is narrower. SAM 3.1 tracks one product through every frame of a 15 fps copy and counts its
seconds on screen. Muse Spark checks crops against a product photo to reject same-brand look-alikes; on one Reel the
builder filmed, that counted 0.0 s against 4.3 s for SAM alone. Plain-English terms such as "on screen at least 3
seconds in total" are checked as typed rules, each with the moment that proves it.

Limits: it needs the delivered file, cannot see the caption or the Paid-partnership label, and passes disclosure on a
spoken or on-screen "ad" without measuring how long a label stays up.

### Terms like these in public briefs

The demo's three terms are the kind of clause public brief templates spell out; a template does not make a clause
standard.

- [JoinBrands' UGC brief template](https://joinbrands.com/blog/ugc-brief-template/): "The product visible for at least
  3 seconds". It does not say whether that is in total or in one stretch; Screen-Time can check either.
- [Insense](https://insense.pro/blog/ugc-brief): "Show the product within the first 3 seconds."
- [Cohley](https://cohleybrandresource.freshdesk.com/support/solutions/articles/48001276120-non-negotiables-and-ai-asset-analysis):
  "Must mention “I’m partnering with XYZ brand” with first 5 seconds of video".
- [Hypefy](https://hypefy.ai/blog/influencer-brief): a paid promotion declaration, plus "Ad" spoken and on screen at the
  start of the integration.
- [Later Influence](https://help-influence.later.com/hc/en-us/articles/20462357687319-Understanding-FTC-Sponsored-Content-Disclosures):
  "Superimposed text must remain on screen for at least 10 seconds".
- [InfluenceFlow's sample agreement](https://influenceflow.io/resources/sample-influencer-agreement-complete-guide-free-templates-for-2026/):
  when the required disclosure is missing, the brand may "withhold final payment (50% clawback)".

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
5. **Listen.** Voice Transcribe returns each spoken turn with approximate start and end times, not word times;
   Screen-Time places the brand name by its position in the turn, so a spoken time can be off by a second or two.
6. **Measure.** Seconds on screen, share of video, first seen, longest continuous run, size in frame and a 0–100
   prominence score.
7. **Contract.** The brand writes terms in plain English ("on screen at least 2 seconds within the first 5 seconds").
   Muse Spark turns each into a typed rule (structured output). Code checks each rule, on-screen ones to the frame, and
   returns pass/fail with the moments that prove it.

**Disclosure.** The "discloses the ad" term passes when the creator says it is an ad ("this is an ad", "sponsored by",
"paid partnership" and the like; a denial such as "this isn't an ad" does not count), or when Muse Spark reads "#ad",
"Sponsored" or the like burned into one of up to 10 frames sampled from the video, weighted to the opening. The post's
caption and the platform's Paid-partnership label are not in the delivered file, so they are not checked, and nothing
measures how long a label stays on screen. When an endorsement is both seen and heard, the FTC wants the disclosure
both seen and heard ([16 CFR 255.0(f)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255/section-255.0));
Screen-Time passes the term on either one today, so it is not an FTC compliance check. On Michael K's Reel the term
passed only on our caption card "AN AD", the end of his line "I would drink them even if it wasn't an ad", which the
spoken check had rejected as a denial.

**The report** is a verdict first: Delivered, Fell short, or Needs review. It has a player with SAM's boxes drawn
live (lime is counted, dashed red is rejected), a screen-time strip synced both ways with the player, and contract
terms that jump to their evidence. Campaigns roll up across creators, with CSV export.

**The follow-up agent** is Muse Spark with tools, working on one creator's video. It reads the report and the
creator's other videos, can re-check a re-cut, drafts the note to the creator and makes a pay/hold call. It never
sends anything: a re-cut request waits for the brand to approve it, and the note is a draft. Every turn goes through
the cost guard, and the number of turns is capped.

## Cost safety

Every billed call reserves its cost in a ledger before it is made. SAM 3.1's reservation is then settled to the frames
it processed; each Muse Spark and Voice Transcribe call stays at a flat reservation ($0.02 and $0.01) that is never
settled against Meta's bill. Those reservations sit above what a typical call costs at Meta's published prices
([API notes](docs/meta-api-notes.md)), so the costs on receipts and in this README are upper bounds, not Meta's bill.

The per-video cap is exact. On Vercel Blob the total cap is checked against a copy of the ledger, so two runs at the
same moment can overshoot it by up to one per-video budget each, and a run stopped by the platform's time limit never
adds its spend. A recovery retry runs only when the budget still covers it and the rest of the run. The sample run and
visitors' agent runs start only while one more run fits under the total cap less `SCREEN_TIME_OWNER_RESERVE_USD`, so
that much is kept for the demo password.

## Run it

Needs Node.js 20.9 or later (22 recommended) and pnpm 12: `corepack enable` picks up the version pinned in
`package.json`. ffmpeg comes from `ffmpeg-static`.

```bash
pnpm install
cp .env.example .env.local   # then set META_MODEL_API_KEY
pnpm dev                     # http://localhost:3000
```

The checks, which need no Meta key:

```bash
pnpm typecheck
pnpm lint
pnpm test        # no live API calls
pnpm build
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
| `SCREEN_TIME_OWNER_RESERVE_USD` | Kept for the demo password: the sample run and visitors' agent runs stop starting this far below the total cap (default $5) |
| `SCREEN_TIME_SHOW_ARCHIVED` | Scripts only: `1` reads the archived campaigns again. Never set it on the site |

On the builder's machine, with a Meta key and the Reels on disk (they are not in this repo):

```bash
pnpm run-clip --prompt "drink can" --product "a pink LaCroix Strawberry Peach sparkling water can" \
  --brand LaCroix --brand "La Croix" --term "On screen at least 3 seconds in total" \
  --target lacroix-can --product-photo product.jpg --max-usd 0.50 path/to/reel.mp4
pnpm accuracy data/out --labels data/labels/lacroix   # precision/recall against the LaCroix labels
pnpm import-runs       # show CLI runs in the app
```

The friends' Reels are not in this repo; `scripts/build-lacroix.mts` builds the campaign from a folder that holds
them. The demo video (`public/demo.mp4`) and its poster do show some of the friends, with their permission
([Rights](#rights)).

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

## Rights

- The LaCroix Strawberry Peach campaign is a test run by Aetrai. LaCroix and Poppi are not involved, and Screen-Time
  is not affiliated with, sponsored or endorsed by them. LaCroix, Poppi and the other product names and packaging
  shown belong to their owners.
- 8 friends filmed 9 of the 11 Reels; the builder filmed the 2 look-alike clips. Every friend shown agreed to be shown
  publicly. They agreed outside the app, so the store holds no consent records for the Reels the script added
  (`scripts/build-lacroix.mts`). Michael K's Reel went through his request link instead, uploaded on his behalf for the
  demo recording, so his consent box was ticked for him.
- We burned in the captions from each Reel's own speech; the disclosure check reads them as on-screen text.
- The product photo is our own iPhone photo of a can, cut out and placed on a plain backdrop.
- Demo video: voiceover ElevenLabs Eleven v4 via fal.ai, music Google Lyria 3.5 via the Gemini API, edited in
  Remotion.

## Licence

MIT covers the code and docs (see [LICENSE](LICENSE)). `public/demo.mp4` and `public/demo-poster.jpg` show real people
and third-party products; they are not MIT-licensed.
