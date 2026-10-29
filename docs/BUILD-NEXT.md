# Build next (decided 2026-10-29)

Source: a five-judge panel (three Claude lenses plus Codex and Gemini) asked what earns 40/40 on premium, mobile,
feedback and clarity, and on the hackathon criteria (impact 30, Meta tooling 25, demo 25, technical depth 20).
Aldo approved every item below on 2026-10-29.

## Decided
- No Stripe checkout. Add one unit-economics line on the landing page instead (Meta cost about $0.10 per video
  from the real reports, priced at about $2-5 per verified video).
- No email sign-in accounts. Reports stay public via share links; mention per-brand isolation as "next" in the README.
- Aldo will get 6-10 friends to film 15-second Reels holding the same product. Each one sends the video through the
  app's own request link (consent recorded). This builds one real hero campaign with real handles; the current test
  runs move to an "Accuracy set" campaign.
- Check whether Muse Spark Open (and Muse Glimmer) are actually available via Baseten or Modal before building on
  them (web-search the exact names: they may be newer than training, never assume they don't exist).

## Build list, in order
1. Verdict first on the phone report: pinned "Hold $300 · brand never said" above or over a shorter video (about 55svh).
2. Money on verdicts: a fee per creator on the roster; pay/hold amounts in the report, roll-up headline
   ("Pay 5 creators $2,000 · hold 7 ($2,800)"), filter tabs All / Pay / Hold, CSV columns.
3. Live analysis screen: stages streamed while a run is in progress (frames sampled, SAM 3.1 boxes landing on a
   filmstrip, Muse Spark accept/reject per object with its reason, transcript words, terms ticking), plus a "Replay
   analysis" button on finished reports for judges who don't upload.
4. Show each model's work: under each term, how Muse Spark read it (the compiled rule); a per-video run receipt
   (each model call: input, output, time, cost; model versions; sample rate; run id).
5. Accuracy you can check: ablation (SAM alone vs + Muse Spark vs + product photo), two honest failure cases with
   frames, a held-out set from other people once the friends' clips exist; clarify analysis fps vs source fps.
6. Fell-short follow-up: "Copy revision request" (missed terms, required vs observed, proof links); "Needs review"
   (amber) when Muse Spark cites blur, occlusion or uncertainty, or a measurement is near a threshold; manager
   override with a written reason kept next to the original result.
7. Judges can try it without the password: "Try a sample video" runs a preset clip, cost-capped and rate-limited.
8. Product photo shown beside the crop it was compared with, with Muse Spark's attribute checks.
9. Agentic follow-up (Best agentic bonus): a Muse Spark tool-calling campaign agent (request_video, analyze,
   check_disclosure, draft_creator_note, recommend_payout). On fell short it drafts the re-cut request with evidence;
   a re-cut upload is re-checked and flips the verdict. Visible step log; a human approves anything sent.
10. Proof clip export (Most viral bonus): ffmpeg burns boxes, strip, verdict and mention marker into a 9:16 MP4 from
    any report and share link; a per-report Open Graph card so the link unfurls on X.
11. Open-weight comparison (Best open-weight bonus), only if available: run the look-alike check or the on-screen
    #ad reader on Muse Spark Open via Baseten or Modal; publish hosted vs open precision, recall, cost and latency.
12. Remaining design-judge items from round 3 (alignment, focus/error states, mini player polish, one bottom bar on
    /campaigns/new), then re-score with all five judges until a round finds nothing material.

## State
- Items 1-10 done and pushed (latest b53e071): money + phone verdict, live view + replay, receipt + compiled rules,
  accuracy page + ablation, revision request / look flags / override, try a sample, photo beside crop + feature
  checks, follow-up agent (Muse Spark tool calling), proof clip + per-report share card. Production redeployed with
  all of it on 2026-10-29 (screen-time-inky.vercel.app) and checked: a visitor's sample run goes live end to end.
- Item 11 (open-weight): built and waiting on one provider key. Muse Spark Open exists (released 2026-10-15) but
  the Meta Model API does not serve it to this key; scripts/open-weight.mts compares it with hosted Muse Spark on the
  37 labelled objects (hosted: 37/37) as soon as OPEN_BASE_URL / OPEN_MODEL / OPEN_API_KEY are set (OpenRouter or
  Baseten; Aldo signs up, the key goes in with set-secret.sh).
- Fixed on the way to production (never seen locally): Vercel's ffmpeg is 7.0.2 (no drawtext, no frame count on a
  stream copy) and Blob's weak ETags broke every update of a large document. Linux test path: Docker (see memory).
- Production reports from before tonight have no receipts, feature checks or live progress; re-running the hero
  clips there would show them (about $0.10 each, needs the demo password).
- 2026-10-29: the five features plus two deep review rounds are committed (545e7a2) and pushed. Preview:
  https://screen-time-gyxfq1zmq-aldos-projects-dcad187d.vercel.app (Vercel login). Production not deployed (needs Aldo's OK).
- Accepted low findings: "sponsored by" also matches a creator describing someone else's sponsored video; bulk links
  for a roster with no explicit list are not capped (the roster itself has no cap yet).
- The stanley-live-demo campaign exists only in the local store, not in Blob.
