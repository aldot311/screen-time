# Demo video: 3 minutes

Judging: impact 30%, use of Meta tooling 25%, demo 25%, technical depth 20%. Each beat below earns one of those.
Speak to a brand manager, not to engineers; name the Meta model at the moment it does something on screen.

## Before recording

- Production build, local: `SCREEN_TIME_LOCAL_FILES=1 pnpm start --port 3312`, with the password set. Unlock once.
- Have `data/videos/clip07.mp4` ready to upload (the Stanley clip). Delete any earlier "Stanley: live demo"
  campaign so the create step is fresh.
- Browser at 1440×900, zoom 110%, no bookmarks bar. Close other tabs.
- A run takes under a minute (a retry adds one more SAM pass); record it, then cut the wait to 3–4 seconds.

## Script

**0:00–0:15 · The problem** (impact)
On the landing page, hero playing.
> "Brands pay creators to show their product. The contract says 'three seconds on screen, say the name once.' Today
> someone scrubs through every video by hand, or nobody checks at all. Screen-Time checks every frame."

**0:15–0:40 · The answer in one shot** (Meta tooling)
Stay on the hero card while it plays.
> "This is a real run on Meta's API. SAM 3.1 tracks every can in the shot. Muse Spark checks each one: the Alani can
> counts, and the Stanley tumbler next to it is boxed but rejected. The strip fills only while the real product is on
> screen, Voice Transcribe catches 'Alani' at three and a half seconds, and the contract terms tick off as they are
> earned."

**0:40–1:20 · Live: a brand sets up a campaign** (demo, agentic)
Click *Open the app* → *New campaign*. Type: Stanley, prompt "tumbler", the product description, two terms.
Upload clip07 as @aldo.tile. Show the steps running (cut the wait).
> "I describe the product in plain words and paste the contract terms in plain English. I'll use the word 'tumbler'
> on purpose: SAM finds nothing with it."
Open the finished report and point at *What the tracker found*.
> "So the agent recovers. Muse Spark looks at the video, sees the tumbler held like a cup, suggests 'cup', and SAM
> runs again and finds it. When the product isn't in a video at all, Spark says so and no second pass is paid for."

**1:20–2:00 · The report: proof, not views** (impact, depth)
On the clip07 report: play a few seconds with the lime box on the tumbler, then click a term's *Jump to*.
> "Delivered, two of two terms met. Every number links to the second that proves it."
Switch to *Stanley: test runs*, open a creator that *Fell short*, and click the failing term.
> "Here's one that fell short: the product was on screen for ten seconds, but the creator never said 'Stanley'.
> That's the conversation a brand needs to have before paying."

**2:00–2:25 · Look-alikes** (depth)
*Alani Nu: test runs* → clip05. Play it: dashed red box, hatched strip.
> "This creator held a different can. Muse Spark rejected it and says why. Zero seconds counted, and you can see the
> rejection, not just a missing number."

**2:25–2:45 · Across creators**
Back to the campaign roll-up: thumbnails, strips, verdicts. Click *Export CSV*.
> "One campaign, every creator: who delivered, who fell short, and a CSV for the payout spreadsheet."

**2:45–3:00 · Why you can trust it** (depth, close)
Landing page, accuracy section.
> "Measured frame by frame against checked labels: 97.7% precision, 95.6% recall. About ten to fifteen cents a
> video. Screen-Time: proof your product was seen."

## Shot list for b-roll if needed

- Phone-held clips: data/videos/clip12 (can plus tumbler) is the strongest single frame.
- Share card: /opengraph-image.
