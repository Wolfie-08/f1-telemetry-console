# F1 Telemetry Console

A live race-analysis console for Formula 1, built against the public
[OpenF1](https://openf1.org) API. Everything runs in the browser — there is no
backend, no API key and no account.

Built for the 2026 Spanish Grand Prix at **Madring** (Madrid), 13 Sept 2026,
race start **13:00 UTC / 18:00 Tashkent**.

---

## Running it

### The quick way — no setup

Double-click **`F1-Console.html`**. That single file contains the whole app
(React, styles, circuit geometry, everything) and opens straight off the disk.
It pulls live data from OpenF1 over HTTPS as soon as it loads.

### The dev way

```bash
npm install      # run this on THIS machine — see the note below
npm run dev      # http://localhost:5173
npm run build    # rebuilds dist/ and regenerates F1-Console.html
```

> **Note on `node_modules`** — the dependencies currently in this folder were
> installed on Linux, and esbuild/rollup ship platform-specific binaries. The
> first time you run the dev server on macOS, delete `node_modules` and run
> `npm install` again. `F1-Console.html` is unaffected: it is already built and
> needs nothing installed.

---

## What it shows

### RACE tab

| Panel | What's in it |
|---|---|
| **Timing tower** | Position, tyre compound and age, stops, gap to leader, interval to the car ahead, last lap, all three sector times with live mini-sector colouring, speed-trap. Purple = session best, green = personal best. |
| **Live positions** | Every car plotted on the Madring outline, in real time, coloured by team. Click a driver in the tower to highlight them. |
| **Race trace** | Cumulative gap to the lap leader, per lap, for the top 12. Flat lines mean matched pace; a vertical step is a pit stop; a steady slope is real pace difference. This is the panel that tells you whether an undercut is working. |
| **Tyre strategy** | One bar per driver, segmented by stint and compound, with pit stops marked. |
| **Race control** | The official message feed — flags, safety cars, investigations, deleted lap times — newest first. |
| **Header** | Track status, lap counter, session-fastest lap, air/track temperature, wind, rainfall, circuit-local clock. |

### COMPARE tab

Pick any two drivers and any two of their laps:

- **Speed map** — the reference lap traced on the circuit and coloured by
  speed, with corners detected and numbered automatically.
- **Speed / throttle / brake** — both laps overlaid on a shared distance axis.
- **Cumulative delta** — where the time actually goes, with each corner
  shaded and labelled by how much was won or lost in it.

Corners are found from the speed trace itself (significant local minima,
expanded to the braking point and the exit), so this works at any circuit
without a track definition file — including brand-new ones like Madring.

---

## How it works

```
src/
  api/openf1.js        Rate-limited client. One global FIFO queue paced at
                       ~2.6 req/s against OpenF1's hard 3 req/s cap, with
                       429 backoff, retries, in-flight de-duplication and a
                       permanent cache for static resources.
  state/useRaceFeed.js The polling engine. Resources are tiered by how fast
                       they really change — location/intervals/position at 3s,
                       laps at 6s, stints/pits/race-control/weather at 30s,
                       classification at 90s — and every incremental fetch
                       carries a `date>` cursor so each poll returns only what
                       is new. Total load stays near 1.3 req/s.
  lib/derive.js        Feed store -> timing-tower rows, lap counter, track
                       status, race-trace series.
  lib/telemetry.js     Lap analysis: distance integration, resampling,
                       delta-time, corner detection, speed colouring.
  lib/track.js         Circuit geometry and projection.
  components/          One file per panel.
tools/inline.mjs       Folds the build into the single-file F1-Console.html.
```

**Why distance is integrated from speed, not taken from GPS.** The `/location`
feed is sampled sparsely and drops out; the speed channel does not. Delta-time
analysis only needs a distance axis that both laps share, and integrating
`v·dt` gives exactly that. GPS is used only for drawing.

**Why the circuit outline is a traced lap.** Madring is new and has no entry in
the usual circuit-geometry sources. The outline in `lib/track.js` is Norris'
pole lap from Madrid qualifying (session 11365, lap 18, 1:31.824) recorded in
the same coordinate frame the live position feed uses — so cars plot directly
onto it with no registration step. `deriveOutline()` will build the same thing
for any other circuit from any clean lap.

---

## Things worth knowing

- **Session selection is automatic.** On load the console picks whatever
  session is running right now; if nothing is live it falls back to the most
  recent one. The dropdown in the header overrides that.
- **Polling only runs for a live session.** A finished session loads once in
  full and then sits still, so you can pick apart yesterday's qualifying
  without burning requests.
- **The status bar is the health check.** Request count, queue depth, 429s,
  failures, and how stale the newest sample is. If `429` starts climbing,
  something is polling harder than it should.
- **Free-tier lag.** OpenF1's public endpoint is not instantaneous; expect the
  feed to sit a little behind the TV picture. The `feed Ns ago` readout in the
  status bar tells you exactly how far.
- **Lapped cars.** OpenF1 sends `gap_to_leader` as the string `"+1 LAP"` once a
  car is lapped; the tower passes that straight through.

---

## Data source

All data from the [OpenF1 API](https://openf1.org/) — an open-source,
unofficial Formula 1 data service. Not affiliated with Formula 1 or the FIA.
