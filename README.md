# F1 Telemetry Console

A pit-wall style Formula 1 analysis console that runs entirely in the browser.
Live timing while a session is on, a season archive you can scrub through like
video, and lap-vs-lap telemetry comparison with corners found in the data
itself.

**Live: [f1.enkd.uz](https://f1.enkd.uz)**

No backend, no build step required to run it, no account. One static page
talking to the [OpenF1 API](https://openf1.org/).

---

## Running it

**The quick way.** Open `F1-Console.html`. That single file is the entire
application — React, styles, circuit geometry, all of it inlined — and it runs
straight off the filesystem.

**The dev way.**

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # rebuilds dist/ and regenerates F1-Console.html
```

---

## What it does

Three views, and two modes that decide what data they show.

**LIVE** follows whatever session is running, switching to it by itself fifteen
minutes before the start. With nothing on track it counts down to the next
session in both your time and the circuit's.

**ARCHIVE** is season → round → session for every weekend since 2023. Any
finished session gets a replay transport: play, pause, scrub, and 1× through
60× speed, with the cars moving on the track map as the clock runs.

| View | What's in it |
|---|---|
| **RACE** | Timing tower — position, tyre compound and age, stops, gap to leader, interval, last lap, all three sectors with live mini-sector colouring, speed trap. Purple is session best, green personal best. Alongside it: every car plotted on the circuit in real time, a race trace of cumulative gap to the leader, tyre strategy bars with pit stops marked, and the race control message feed. |
| **COMPARE** | Pick two drivers and two laps. Speed map of the reference lap coloured by speed with corners numbered, both laps' speed and pedal traces overlaid on a shared distance axis, and a cumulative delta curve showing where the time actually went, corner by corner. |
| **TABLE** | Drivers' and constructors' championships for the season. |

---

## The thing to know before you use it

**OpenF1 closes to anonymous callers while a session is running.** Not just live
timing — *everything*, historical sessions included. Requests get `401`, and
because that response carries no CORS header a browser sees only an opaque
network failure.

The console handles this rather than pretending the season is empty: it caches
the calendar, recognises the blackout, and counts down to when access returns.
It just cannot show you data it is not allowed to fetch.

Live access is OpenF1's sponsor tier (€9.90/month). If you have an account,
the blackout screen takes your login, mints an OAuth2 bearer token and
re-mints it before the hourly expiry so a two-hour race doesn't drop out.
Credentials stay in your browser and go only to `api.openf1.org/token`.

Without one, everything works fully the moment a session ends — which is when
the interesting analysis happens anyway.

**Rate limits** are per minute as well as per second: 30/min anonymous, 60/min
authorised. The per-minute cap binds far earlier than the per-second one, so
all requests go through a single paced queue derived from the per-minute
budget. Tier and current pace are shown in the status bar.

---

## How it works

```
src/
  api/openf1.js        One global FIFO request queue paced off the per-minute
                       rate limit, with OAuth2 token handling, 429 backoff,
                       in-flight de-duplication, a 20s timeout on every
                       request, and a permanent cache for static resources.
  state/useRaceFeed.js The polling engine. Resources are tiered by how fast
                       they actually change — positions and intervals at 5s,
                       laps at 10s, stints and race control at 45s — and every
                       incremental fetch carries a `date>` cursor so each poll
                       returns only what is new.
  state/useSeason.js   Season calendar (cached to localStorage so the app still
                       knows what is live during a blackout) and standings.
  state/useReplay.js   The virtual clock and its transport controls.
  lib/replay.js        Projects the loaded history onto a virtual time.
  lib/telemetry.js     Distance integration, resampling, delta-time, corner
                       detection, speed colouring.
  lib/derive.js        Feed store → timing tower rows, lap counter, flags.
  lib/track.js         Circuit geometry and projection.
  components/          One file per panel.
```

Three decisions worth explaining:

**The circuit outline is a traced lap.** Madring is new and absent from the
usual circuit-geometry sources. The outline is Norris' pole lap from Madrid
qualifying, recorded in the same coordinate frame the live position feed
uses — so cars plot onto it directly, with no registration step.
`deriveOutline()` builds the same thing for any circuit from any clean lap.

**Distance is integrated from speed, not taken from GPS.** The position feed is
sampled sparsely and drops out; the speed channel does not. Delta-time analysis
only needs a distance axis both laps share, and integrating `v·dt` gives
exactly that.

**Corners are detected, not configured.** Significant local minima in the speed
trace, each expanded back to the braking point and forward to the exit. No
track definition file, which is why it worked at a brand-new circuit on day
one.

**Replay is a projection, not a second data feed.** A finished session loads
once in full; replaying it is a pure function from that history and a virtual
time. The only thing fetched as the clock moves is a three-second window of car
positions, because a full race's position trace runs to hundreds of thousands
of samples.

---

## Related work

[FastF1](https://github.com/theOehrly/Fast-F1) is the serious Python library for
F1 data analysis and worth using for anything heavier than this.
[f1-dash](https://f1-dash.com/) and [monaco](https://github.com/tdjsnelling/monaco)
are live-timing dashboards that decode F1's own SignalR feed through a server-side
relay — more capable live, but they need a backend, and F1 has been IP-blocking
hosted instances.

---

## Disclaimer

Unofficial and unaffiliated with Formula 1. F1, FORMULA ONE, FORMULA 1, and
related marks are trade marks of Formula One Licensing B.V. Data comes from the
[OpenF1 API](https://openf1.org/), itself an unofficial project.

## License

MIT — see [LICENSE](LICENSE).
