# Accuracy (measured 2026-11-03, the LaCroix Reels)

Per-frame precision and recall of "brand product on screen" against checked labels, on real runs of the full
pipeline (SAM 3.1 tracking → Muse Spark look-alike check against the product photo → metrics), 15 fps. This is the
set the site shows.

- Test set: 11 vertical Reels filmed by 9 creators for a LaCroix Strawberry Peach campaign (the captioned versions,
  as posted), one product: the pink Strawberry Peach can. Two hold real look-alikes: a LaCroix Pamplemousse can (a
  different flavor, the only can in the clip) and a Poppi Raspberry Rose can on the table beside the LaCroix. Others
  have a Stanley-style tumbler or a fridge full of bottles in frame.
- Labels: drafted by two independent Claude vision passes over frame-numbered 5 fps grids (one in order, one in
  reverse), kept where both agree (or one is certain and the other unsure): data/labels/lacroix/. The passes
  disagreed on 1 of 936 sampled frames. Both called the Pamplemousse can the product from the small grids; at full
  resolution its label reads PAMPLEMOUSSE, so that clip was corrected to "no product" (noted in its file).
- Reproduce: `pnpm run-clip --prompt "drink can" --product "<description>" --brand LaCroix --brand "La Croix"
  --term ... --target lacroix-can --product-photo <photo> data/videos/lacroix/*.mp4`, then
  `pnpm accuracy data/out --labels data/labels/lacroix --json src/lib/accuracy-data.json`.

**Overall: precision 98.1%, recall 99.4%, F1 98.8%.** Look-alike clip (Pamplemousse): 0 s counted (correct).

| Pipeline | Precision | Recall | F1 | Avg. error per Reel | Seconds counted on the look-alike clip |
|---|---|---|---|---|---|
| SAM 3.1 alone (every tracked object counts) | 95.0% | 99.4% | 97.2% | 0.56 s | 4.3 s |
| SAM 3.1 + Muse Spark (confirmed objects only) | 98.1% | 99.4% | 98.8% | 0.17 s | 0.0 s |

Object by object (data/labels/lacroix/objects.json, judged from the crops Muse Spark saw; one fridge-door sliver too
small to judge is left out): hosted Muse Spark 1.3 called 12 of 12 correctly, 10 cans of the product and 2 other
things (the Pamplemousse can, the Poppi can). Open-weight Muse Spark Open (`meta/muse-spark-open` on OpenRouter,
pinned to Fireworks, same crops, same photo, same prompt): 10 of 12, 0 look-alikes counted, 2 real cans called
"unclear" (Michael's in-hand can coming out of the fridge, Lana's blurred can), which the app would not count and
would flag for a look. Precision 100%, recall 80%, median 905 ms per check, $0.12 for the 12 checks.
`scripts/open-weight.mts --labels data/labels/lacroix --photo <photo> --run`.

Where it is wrong:
- Michael's Reel: the can is on screen 2.6 s by the labels, the app counted 3.1 s (SAM picks the can up a few frames
  early as he pulls it out of the fridge). The contract asks for 3 s, so the app said pay where the labels say hold.
  It did flag the report "worth a look: near a threshold".
- Run-to-run: in this measured run Muse Spark matched George's small, blurred can (11.3 s); in the campaign run on
  the site the same Reel's can came back "unclear" and counted 0 s, so the app holds it and flags it for a look.
  Small cans can flip between runs; the app never counts an object it is unsure of.

Cost of the 11 runs: $1.54 of Meta API ($0.106–0.220 per Reel), with the product photo and transcription.

# Earlier test set (2026-10-28, the builder's own clips; not shown on the site)

Per-frame precision and recall of "brand product on screen" against checked labels, on real runs of the full
pipeline (SAM 3.1 tracking → Muse Spark look-alike check → metrics), 15 fps.

- Test set: 20 labelled vertical clips (15 filmed by Aldo, 5 Pexels stock; a sixth stock clip was never labelled), 23 clip/product targets (clip11, clip14 and clip15 each show two products): an Alani Nu can,
  a Stanley tumbler, a New Balance sneaker, generic sneakers, cans, a bottle and a cup, plus a coconut-water look-alike
  that must be rejected and a clip with no product.
- Labels: drafted by two independent Claude vision passes over frame-numbered 5 fps grids, kept where both agree
  (data/labels/, method recorded in each file), and spot-checked by a person.
- Reproduce: `pnpm run-clip ... --target <name>` per target, then `pnpm accuracy`.

**Overall: precision 97.7%, recall 95.6%, F1 96.6%.** Look-alike clip: 0 s counted (correct). Empty clip: 0 s (correct).

Ablation (same runs, no model run again; `pnpm accuracy -- --json src/lib/accuracy-data.json`, shown in the app at
/accuracy):

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

Analysis rate: every video is re-encoded to 15 fps before SAM 3.1, and SAM tracks every one of those frames; labels
and scores use the same frames.

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
