# Accuracy (the LaCroix Reels as delivered, runs of 2026-11-03)

Per-frame precision and recall of "brand product on screen" for the 11 LaCroix test Reels **as delivered on the
site**, scored from the site's own run reports (the reports a visitor can open) against data/labels/lacroix, 15 fps.
The full pipeline ran on each Reel once: SAM 3.1 tracking → Muse Spark look-alike check against the product photo →
metrics → contract terms. The figures below are the script's output with the labels as they are in this commit; the
site reads them from src/lib/accuracy-data.json, never from copy.

Reproduce, with no model call: `pnpm accuracy --labels data/labels/lacroix` (add
`--json src/lib/accuracy-data.json` to update the site). It scores data/runs, the 11 reports trimmed to what scoring
needs (frames, verdicts, counted frames, terms, receipt date and cost; no URLs, boxes or transcripts), written by
`scripts/export-runs.mts` from the campaign's video documents. A test fails if the two ever disagree.

- Test set: 11 vertical Reels for a LaCroix Strawberry Peach campaign, 9 people (Ash filmed two takes; Aldo, who built
  Screen-Time, filmed two, including the look-alike Reel). One product: the pink Strawberry Peach can. 2,800 frames
  (186.7 s), 1,931 with the product labelled (128.7 s), 869 without. Two Reels hold real look-alikes: a LaCroix
  Pamplemousse can (a different flavor, the only can in the Reel) and a Poppi Raspberry Rose can on the table beside
  the LaCroix.
- Captions: the builder burned captions into each Reel from its own speech (Voice Transcribe), including any "this is
  an ad" line. So the on-screen disclosure check is not independent of the spoken one.
- Labels: drafted by two independent Claude vision passes over frame-numbered 5 fps grids (one in order, one in
  reverse), kept where both agree (or one is certain and the other unsure). Each 5 fps sample stands for itself and
  the next 2 frames, so a range boundary can be off by up to 2 frames (0.13 s) from the sampling alone, and a whole
  sample can be wrong. The passes disagreed on 1 of 936 sampled frames. Both called the Pamplemousse can the product
  from the small grids; at full resolution its label reads PAMPLEMOUSSE, so Claude corrected that clip to "no
  product" after the run (noted in its file). **No person has checked the labels yet: 0 of 11 clips.** A check is
  recorded in each file's `checkedBy` as "<name>, <date>, frame by frame in /label" (`pnpm dev`, then /label), and
  the script counts only those.

**With Muse Spark (what the app reports): precision 98.4%, recall 91.1%, F1 94.6%.**
95% intervals from a clip-clustered bootstrap (whole Reels resampled, 100,000 draws, seed 20261103, percentile):
precision 96.7–99.6%, recall 70.3–100.0%, F1 81.9–99.6%. They cover which Reels are in the set, not label error.

| Per frame, same runs | Precision | Recall | F1 | Avg. error per Reel | Seconds counted on the look-alike Reel |
|---|---|---|---|---|---|
| SAM 3.1 alone (every tracked object counts) | 95.0% (86.0–99.1%) | 99.3% | 97.1% | 0.56 s | 4.27 s |
| SAM 3.1 + Muse Spark (confirmed objects only) | 98.4% (96.7–99.6%) | 91.1% | 94.6% | 1.18 s | 0.0 s |

What Muse Spark adds, honestly. It changed the count on 2 of the 11 Reels:
- Aldo's look-alike Reel (Pamplemousse): SAM alone counted 4.27 s, Muse Spark rejected the can, 0 s. Without that
  Reel, SAM alone scores 98.2% precision (99.3% recall) and SAM + Muse Spark 98.4% (91.1%): all but 0.2 points of the
  per-frame precision gain is this one Reel. The builder filmed it, and its label was corrected after the run (above).
- George's Reel: Muse Spark could not confirm his small can (it called it "unclear"), so nothing was counted:
  0 s against 11.2 s labelled. That is the whole recall loss. The report holds the fee and flags the Reel for a look.

Object by object (data/labels/lacroix/objects.json: each object SAM 3.1 tracked, judged by Claude from its crops as
the product, something else, or too small to tell; one fridge-door sliver is left out), scored against the verdicts in
the site's runs, with exact Clopper-Pearson 95% intervals:

| Object check (12 objects) | Correct | Look-alikes counted | Products missed |
|---|---|---|---|
| Hosted Muse Spark 1.3 | 11 of 12 (61.5–99.8%) | 0 | 1 (George's can, unclear) |
| SAM 3.1 alone (every tracked object counts) | 10 of 12 (51.6–97.9%) | 2 | 0 |

Muse Spark rejected both look-alikes (2 of 2) that SAM alone counts. The open-weight Muse Spark Open check (10 of 12,
0 look-alikes counted, 2 real cans called "unclear"; `scripts/open-weight.mts`) ran on crops from the earlier runs,
which used our zoomed edit of George's Reel (below); it has not been re-run on the Reels as delivered.

Pay or hold on the on-screen term (at least 3 s in total): the app agrees with what the labels imply on 9 of 11 Reels.
The spoken-name and disclosure terms have no independent labels yet; /label now records them per clip (brand said and
when, disclosure said / shown / both / implied / none), and the script scores them once they exist.

Where it is wrong:
- George's Reel: labelled 11.2 s, counted 0 s. The can is small in his wide shot (about 36 px wide at the 540 px
  analysis size) and Muse Spark could not confirm it, so the app holds a fee the labels say is earned. It flags the
  report "worth a look".
- Michael's Reel (not Michael K's): labelled 2.6 s, counted 3.0 s. The contract asks for 3 s, so the app said pay
  where the labels say hold; it flagged the report as close to the threshold. The label may start late (the can comes
  out of the fridge around frames 136–147, which are on the /label check list).

History: until Nov 4 the published figures (98.1% / 99.4% / 98.8%) scored a zoomed edit of George's Reel that we
made: a 2.3x punch-in from 5.5 s that follows the can, placed from SAM's own track of the first site run, where the
can is about 90 px wide. The Reel on the site is the wide cut, and that is what is scored now. The labels for George
were drawn on the zoomed frames; the zoom follows the can, so they can only miss frames on the wide cut, and George is
on the /label check list.

Cost of the 11 runs scored here: $1.56 of Meta API ($0.106–0.230 per Reel), with the product photo and transcription.
SAM 3.1 is billed per frame ($0.20 per 1,000); Muse Spark and Voice Transcribe count a fixed reserve per call ($0.02 /
$0.01), above what they cost, so the total is an upper bound.

# Earlier test set (2026-10-28, the builder's own clips; not shown on the site)

Per-frame precision and recall of "brand product on screen" against labels, on real runs of the full pipeline
(SAM 3.1 tracking → Muse Spark look-alike check → metrics), 15 fps.

- Test set: 20 labelled vertical clips (15 filmed by Aldo, 5 Pexels stock; a sixth stock clip was never labelled), 23 clip/product targets (clip11, clip14 and clip15 each show two products): an Alani Nu can,
  a Stanley tumbler, a New Balance sneaker, generic sneakers, cans, a bottle and a cup, plus a coconut-water look-alike
  that must be rejected and a clip with no product.
- Labels: drafted by two independent Claude vision passes over frame-numbered 5 fps grids, kept where both agree
  (data/labels/, method recorded in each file). No check by a person is recorded for this set.
- Reproduce: `pnpm run-clip ... --target <name>` per target, then `pnpm accuracy data/out` (these reports are not
  committed).

**Overall: precision 97.7%, recall 95.6%, F1 96.6%.** Look-alike clip: 0 s counted (correct). Empty clip: 0 s (correct).

Ablation (same runs, no model run again; `pnpm accuracy data/out`; the site showed it at /accuracy until the LaCroix
set replaced it):

| Pipeline | Precision | Recall | F1 | Avg. error per target | Seconds counted on clips without the product |
|---|---|---|---|---|---|
| SAM 3.1 alone (every tracked object counts) | 89.0% | 96.0% | 92.4% | 0.91 s | 13.3 s |
| SAM 3.1 + Muse Spark (confirmed objects only) | 97.7% | 95.6% | 96.6% | 0.33 s | 0.0 s |

The 13.3 s is the different-flavor Alani can in clip05; SAM alone also counts the Stanley cup held beside the can in
clip12 and clip13. Not measured yet: the gain from the product photo (these runs predate it) and a held-out set
filmed by other people.

Object by object (data/labels/objects.json, judged from the crops Muse Spark saw; four objects too blurred to judge are
left out): hosted Muse Spark 1.3 called 37 of 37 tracked objects correctly, 29 products and 8 other things (a different
Alani flavor, a Stanley beside the can, a Stanley lid, leather dress shoes among sneakers, an Alani can under the
Stanley prompt). `pnpm tsx --tsconfig tsconfig.json scripts/open-weight.mts`.

Open-weight comparison: Meta released Muse Spark Open (816B, open weights) on 2026-10-15. The Meta Model API does not
list it for this account (checked 2026-10-29: GET /v1/models, and muse-spark-open / muse-spark-open-816b return the same
404 as a nonsense model id). Baseten, Fireworks, Groq, Modal, Together and OpenRouter serve it. The script above runs
the same check on it with `--run` once OPEN_BASE_URL, OPEN_MODEL and OPEN_API_KEY point at one of them.

Result (2026-10-29, `meta/muse-spark-open` on OpenRouter, served by Fireworks; same crops, same prompt): 35 of 37
correct, 0 look-alikes counted, 2 real products called "unclear" (clip04 obj0, stock01 obj10), which the app would not
count and would flag for a look. Precision 100%, recall 93.1%, agreement with hosted 94.6%, median 413 ms per check,
$0.22 for the 37 checks.

Analysis rate: every video is re-encoded to 15 fps before SAM 3.1, and SAM tracks every one of those frames. Scores
compare those frames with the labels, which were judged on every 3rd frame (5 fps samples, each standing for 3 frames).

What we learned:
- The SAM prompt matters: "tumbler" found nothing; "cup" found the Stanley at 96–100% precision.
- The verifier first rejected unbranded sneakers as "unclear" for having no visible logo; the instruction now judges
  only the features the brand describes. It still rejects real look-alikes (leather dress shoes among the sneakers).
- clip01's 79% precision is the can leaving the frame: SAM keeps tracking a 13–32 px sliver at the left edge for
  about a second (frames 78–92) after the labels mark it gone. The tracking is right; whether a sliver should count
  is a contract question, so the threshold was not tuned to this test set.
- clip11's Stanley loses 1.9 s (frames 240–267): the tumbler swings up to the lens, cut off by the bottom of the
  frame and blurred, and SAM drops the track until it is back at arm's length. Under-counting, never over-counting.
- Prompt recovery (added after these runs): with the weak prompt "tumbler", clip06 found nothing; Muse Spark looked at
  four frames, said the tumbler was held up to the camera and suggested "cup", and the second SAM pass found it for
  10.1 s, the same as the hand-tuned prompt. Negative controls: the empty clip and the look-alike clip got "not
  visible" from Spark and no second SAM pass. Cost of the three runs: $0.36.
- Test-set API cost: about $3.50 of reserved spend for 23 targets, including verification and transcription.

```
clip01:alani-can                     truth   4.0 s  predicted   4.9 s  precision  79%  recall  97%
clip02:alani-can                     truth  12.0 s  predicted  12.0 s  precision 100%  recall 100%
clip03:alani-can                     truth   5.8 s  predicted   5.9 s  precision  98%  recall  99%
clip04:alani-can                     truth   9.2 s  predicted   8.9 s  precision 100%  recall  97%
clip05:alani-can                     truth   0.0 s  predicted   0.0 s  precision n/a   recall n/a 
clip06:stanley-tumbler               truth  11.4 s  predicted  10.1 s  precision 100%  recall  88%
clip07:stanley-tumbler               truth  11.0 s  predicted  11.3 s  precision  96%  recall  99%
clip08:new-balance-sneaker           truth   1.6 s  predicted   1.5 s  precision 100%  recall  92%
clip09:alani-can                     truth   0.0 s  predicted   0.0 s  precision n/a   recall n/a 
clip10:alani-can                     truth   4.0 s  predicted   4.1 s  precision  97%  recall 100%
clip11:alani-can                     truth   7.0 s  predicted   6.9 s  precision  98%  recall  97%
clip11:stanley-tumbler               truth   9.0 s  predicted   7.5 s  precision  95%  recall  79%
clip12:alani-can                     truth   9.8 s  predicted  10.3 s  precision  95%  recall 100%
clip13:alani-can                     truth   9.3 s  predicted   9.3 s  precision 100%  recall 100%
clip14:alani-can                     truth   3.2 s  predicted   3.1 s  precision 100%  recall  98%
clip14:stanley-tumbler               truth   3.6 s  predicted   3.3 s  precision  94%  recall  87%
clip15:alani-can                     truth   3.6 s  predicted   3.7 s  precision  98%  recall 100%
clip15:stanley-tumbler               truth   3.4 s  predicted   2.6 s  precision  97%  recall  75%
stock/stock01:sneakers               truth   8.5 s  predicted   7.5 s  precision 100%  recall  88%
stock/stock03:blue-can               truth   5.1 s  predicted   5.1 s  precision 100%  recall 100%
stock/stock04:singaraja-can          truth   9.0 s  predicted   9.1 s  precision  99%  recall 100%
stock/stock05:water-bottle           truth  11.6 s  predicted  11.7 s  precision  99%  recall 100%
stock/stock06:coffee-cup             truth   8.0 s  predicted   8.1 s  precision  98%  recall  99%

Overall (per frame): precision 97.7%  recall 95.6%  F1 96.6%
```
