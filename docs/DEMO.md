# Demo video: 3 minutes

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

## Script

The voiceover is generated (ElevenLabs Eleven v4, voice Bill); its word timings drive the captions. The cut (2:49) is built in Remotion from scripted Playwright recordings; sped-up waits carry a speed badge. About 300 words (2 minutes of speech); the other minute is the screen: the live run and the agent steps play without narration.
Every number is read from the live site or src/lib/accuracy-data.json on the day of recording.

**0:00–0:14 · The problem** (impact). Landing page, Ash's Reel playing in the hero.
> Brands pay creators to show their product. The contract says: three seconds on screen, say the name, disclose the
> ad. Today someone scrubs every Reel by hand, or nobody checks at all. Screen-Time checks every frame.

**0:14–0:52 · A live run** (Meta tooling, demo). *Run it on a sample video*; stay on the run page while the steps fill
in; cut the wait.
> This is a real run on Meta's API. SAM 3.1 finds the can in every frame; those are its boxes. Muse Spark compares
> each object against the brand's product photo, and says why in its own words. Muse Voice Transcribe listens for the
> brand name and for the disclosure. Then Muse Spark checks each contract term, written in plain English.

**0:52–1:16 · The pay case** (impact). Ash's re-cut report; tap *Play the proof* on one term.
> Ash's Reel: pay three hundred dollars. Thirteen seconds on screen, LaCroix said out loud, "this is an ad" at
> eleven seconds. Every term links to the exact second that proves it.

**1:16–1:44 · The holds** (impact, depth). Ash's first take (banner), then Aldo's Pamplemousse report, then the Poppi
card on the landing page.
> Her first take never said the brand, so the fee was held until the re-cut. This creator grabbed the wrong flavor:
> Muse Spark read Pamplemousse off the can, so nothing counts. And a Poppi can on the table is another brand, ignored.

**1:44–2:14 · The follow-up agent** (Meta tooling, depth). Peter's report; *Run the follow-up agent*; let the steps
appear.
> Peter never disclosed the ad. The follow-up agent, Muse Spark with tools, reads the report and his other videos,
> drafts the note asking for a disclosure, and queues a re-cut request. Nothing is sent until the brand approves.

**2:14–2:34 · The campaign** (impact). The LaCroix campaign page; point at the money line, then *Export CSV*.
> Across ten creators: pay six, hold three, one still to come. The first take is marked replaced by the re-cut, so the
> money adds up. Export it for finance. Screen-Time never moves money; you pay as you normally do.

**2:34–2:52 · Why you can trust it** (technical depth). /accuracy.
> We labelled every frame of these Reels. Ninety-eight percent precision, ninety-nine percent recall. SAM alone
> counted four seconds of the wrong flavor; with Muse Spark checking, zero. And this page shows where it is still wrong.

**2:52–3:00 · Close.** Run receipt on Ash's report, then the landing page.
> Every Meta call is on the receipt: about eleven to twenty-three cents a Reel. Screen-Time. Proof your product was seen.
