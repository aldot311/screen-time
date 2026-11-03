# Demo video (2:43; the submission allows three minutes)

Judging: impact 30%, use of Meta tooling 25%, demo 25%, technical depth 20%. One continuous story with money in it,
told to a brand manager; name the Meta model at the moment it does something on screen. Every number on screen is a
real production value. (Flow from the round-4 hackathon judge, 2026-10-29.)

## Before recording

- Production: https://screen-time-inky.vercel.app. Every beat below works without the demo password (the sample run,
  the example reports and the follow-up agent on them), so the screen can be recorded by a script.
- Campaign: "LaCroix: Strawberry Peach creators" (`lacroix-strawberry-peach`), the friends' Reels: real handles, fee
  $300, product photo, three terms (on screen at least 3 s in total, says LaCroix, discloses the ad). Use it for the
  report and money beats.
- Live upload: Michael K's Reel, with a Stanley-style tumbler beside the LaCroix can. He is on the roster with no
  video yet; upload it under his handle, Michael K, so it fills his row.
- Re-cut beat: Ash. Her first take (`ash`) is held because she never says LaCroix; her re-cut (`ash-recut`) says it
  and pays. Both are already in the campaign.
- Browser 1440×900 for desktop beats; record the phone beat in the device toolbar at 390×844.
- A short Reel usually takes under a minute and a half to check; record it and cut the wait to a few seconds.
- Judges who skip the video follow /judge: the sample run, Ash's re-cut and first take, the Pamplemousse look-alike,
  /accuracy, and the follow-up agent on Peter's Reel.

## Script (v3, recorded 2026-11-03, 2:43)

Voiceover: ElevenLabs Eleven v4 (voice Bill) via fal.ai; its word timings drive the captions. Music: Google Lyria 3.5,
extended by 12 bars. Footage: scripted Chrome recordings of a local build of main against the live store, at 2880×1620,
edited in Remotion (~/Movies/screen-time-work/remotion/src/v2). Michael K's Reel was really sent through his request link
and run on 2026-11-03; every number is read from the live reports. Sped-up waits carry a speed badge.

**0:00–0:12 · The hook.** Ash's Reel; SAM 3.1's real box locks onto the can; the counter runs to 13.3 s; both spoken checks tick; PAY $300 lands on the music's drop.
> You paid a creator three hundred dollars to show your can. Did she?
> Screen-Time checks. To the second.

**0:12–0:25 · The problem.** Homepage; the three rules pop in on their words; six creators' Reels scrubbed by hand, then greyed out as unchecked.
> Every brand deal has rules: three seconds on screen, say the name, disclose the ad. Today, someone scrubs every Reel by hand. Or nobody checks at all.

**0:25–0:35 · A creator sends his Reel.** Michael K's request link (no account, no password), the upload, then the brand's campaign page and Run analysis.
> Michael K, the last creator, sends his Reel through his link. No account, no password. Then the brand hits run.

**0:35–0:58 · The live run.** His run page step by step (waits sped up, with a badge); a chip names each Meta model as it works.
> Screen-Time checks it live, on Meta's models. SAM three point one finds the can in every frame. Muse Spark checks each one against the product photo: right brand, right flavor. Muse Voice Transcribe listens for the name and the disclosure. Then Muse Spark checks the contract, written in plain English.

**0:58–1:18 · The pay case.** His report: 14.5 s on screen, LaCroix said, "AN AD" on screen at 0:09.2; Pay $300, after a look (Muse Spark saw the can blurred); a tap plays the proof.
> Fourteen and a half seconds on screen, LaCroix said out loud, and "an ad" on screen at nine seconds. Pay three hundred dollars, after a quick look: Muse Spark saw the can blurred. Tap any term, and it plays the exact second that proves it.

**1:18–1:36 · The holds.** Ash's first take (held, replaced by her re-cut), the Pamplemousse can (0 s counted), the Poppi card (ignored).
> Ash's first take never said the brand, so it was held until the re-cut. This creator grabbed the wrong flavor: Muse Spark read Pamplemousse off the can, so zero seconds count. And a Poppi on the table? Another brand. Ignored.

**1:36–1:52 · The follow-up agent.** Peter's report; the agent run at 5×; the note and the re-cut request waiting for approval.
> Peter never disclosed the ad. The follow-up agent, Muse Spark with tools, reads his report, drafts the note, and queues a re-cut. Nothing is sent until you approve.

**1:52–2:01 · The campaign.** Pay 7 creators $2,100 · hold 3 ($900); Export CSV.
> Ten creators: pay seven, hold three. Export it for finance. Screen-Time never moves money.

**2:01–2:17 · Accuracy.** 98.1% precision, 99.4% recall per frame against checked labels; SAM alone 4.3 s of the wrong flavor vs 0.0 s with Muse Spark; where it is still wrong.
> Measured frame by frame against checked labels: ninety-eight percent precision, ninety-nine percent recall. SAM alone counted the wrong flavor. With Muse Spark checking: zero. And we show you where it's still wrong.

**2:17–2:33 · Built during the hackathon.** The six parts lighting up, a verbatim excerpt of src/lib/pipeline/run.ts, the open-source repo (MIT, 96 commits, 479 tests).
> Everything you just saw was built during this hackathon: the pipeline on SAM three point one, Muse Spark and Voice Transcribe, the contract checker, the follow-up agent, and the accuracy harness. And it's all open source.

**2:33–2:43 · Close.** The run receipt on Ash's re-cut, then the end card: the site, the repo, the three Meta models.
> About eleven to twenty-three cents a Reel. Screen-Time. Proof your product was seen.
