# Accuracy (measured 2026-10-28)

Per-frame precision and recall of "brand product on screen" against hand-checked labels, on real runs of the full
pipeline (SAM 3.1 tracking → Muse Spark look-alike check → metrics), 15 fps.

- Test set: 21 vertical clips (15 filmed by Aldo, 6 Pexels stock), 23 clip/product targets: an Alani Nu can,
  a Stanley tumbler, a New Balance sneaker, generic sneakers, cans, a bottle and a cup, plus a coconut-water look-alike
  that must be rejected and a clip with no product.
- Labels: drafted by two independent Claude vision passes over frame-numbered 5 fps grids, kept where both agree
  (data/labels/, method recorded in each file), and spot-checked by a person.
- Reproduce: `pnpm run-clip ... --target <name>` per target, then `pnpm accuracy`.

**Overall: precision 97.7%, recall 95.6%, F1 96.6%.** Look-alike clip: 0 s counted (correct). Empty clip: 0 s (correct).

What we learned:
- The SAM prompt matters: "tumbler" found nothing; "cup" found the Stanley at 96–100% precision.
- The verifier first rejected unbranded sneakers as "unclear" for having no visible logo; the instruction now judges
  only the features the brand describes. It still rejects real look-alikes (leather dress shoes among the sneakers).
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
