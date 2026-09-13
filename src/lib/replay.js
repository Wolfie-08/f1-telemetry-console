// ---------------------------------------------------------------------------
// Replay projection.
//
// A finished session is loaded once in full, so replaying it is not a second
// data feed -- it is a pure function from (full history, virtual time) to the
// state the console would have shown at that moment. The only thing fetched
// live during replay is a two-second window of car positions around the
// virtual clock, because the full position trace for a race would be
// hundreds of thousands of samples.
// ---------------------------------------------------------------------------

const ms = (iso) => new Date(iso).getTime()

/** Wall-clock time a lap was completed (its start plus its duration). */
const lapEnd = (l) =>
  l.date_start && l.lap_duration ? ms(l.date_start) + l.lap_duration * 1000 : null

export function projectStore(full, vt) {
  const view = {
    session: full.session,
    meeting: full.meeting,
    gmt: full.gmt,
    drivers: full.drivers,
    driverNums: full.driverNums,
    lapsByDriver: {},
    latestLap: {},
    bestLap: {},
    bestSectors: {},
    sessionBestLap: null,
    sessionBestSectors: [null, null, null],
    intervals: {},
    positions: {},
    stints: {},
    pits: [],
    rc: [],
    weather: null,
    loc: full.loc,           // supplied by the windowed replay fetch
    result: [],              // classification is a spoiler mid-replay
    lastSampleAt: full.lastSampleAt,
  }

  // --- laps completed by the virtual time ---------------------------------
  const cum = {}
  for (const n of full.driverNums) {
    const done = (full.lapsByDriver[n] || []).filter((l) => {
      const e = lapEnd(l)
      return e != null && e <= vt
    })
    if (!done.length) continue
    view.lapsByDriver[n] = done
    view.latestLap[n] = done[done.length - 1]

    let best = null
    const pb = [null, null, null]
    let total = 0
    for (const l of done) {
      total += l.lap_duration
      if (best == null || l.lap_duration < best) best = l.lap_duration
      ;[l.duration_sector_1, l.duration_sector_2, l.duration_sector_3].forEach((v, i) => {
        if (v == null) return
        if (pb[i] == null || v < pb[i]) pb[i] = v
        const sb = view.sessionBestSectors[i]
        if (sb == null || v < sb.time) view.sessionBestSectors[i] = { time: v, driver: n }
      })
    }
    view.bestLap[n] = best
    view.bestSectors[n] = pb
    cum[n] = { laps: done.length, total }
    if (best != null && (!view.sessionBestLap || best < view.sessionBestLap.time)) {
      view.sessionBestLap = { time: best, driver: n, lap: done.find((l) => l.lap_duration === best)?.lap_number }
    }
  }

  // --- order, from the position feed as it stood then ----------------------
  // Before a driver's first position event the feed has nothing to say, so
  // fall back to their earliest known position -- which is the grid slot.
  for (const n of full.driverNums) {
    const hist = full.positionHistory?.[n] || []
    if (!hist.length) continue
    const seen = hist.filter((r) => ms(r.date) <= vt)
    view.positions[n] = seen.length ? seen[seen.length - 1] : hist[0]
  }

  // --- gaps ---------------------------------------------------------------
  // Intervals are not preloaded for replay (a race is ~27k rows), so the gap
  // column is reconstructed -- but the right arithmetic depends on the
  // session. A race is decided on total elapsed time; a qualifying or
  // practice session is decided on one best lap, and cumulative time there is
  // meaningless because everyone runs a different number of out- and in-laps.
  if (full.session?.session_type === 'Race') {
    const ranked = Object.entries(cum)
      .map(([n, v]) => ({ num: Number(n), ...v }))
      .sort((a, b) => b.laps - a.laps || a.total - b.total)

    if (ranked.length) {
      const leader = ranked[0]
      ranked.forEach((d, i) => {
        const down = leader.laps - d.laps
        const gapLeader = down > 0
          ? `+${down} LAP${down > 1 ? 'S' : ''}`
          : +(d.total - leader.total).toFixed(3)
        let interval = null
        if (i > 0) {
          const ahead = ranked[i - 1]
          interval = ahead.laps === d.laps ? +(d.total - ahead.total).toFixed(3) : null
        }
        view.intervals[d.num] = { gap_to_leader: gapLeader, interval, driver_number: d.num }
      })
    }
  } else {
    // Best-lap order is the classification, so it also drives the running
    // order -- the live position feed in a qualifying session reports
    // on-track order, which is not the same thing.
    const ranked = Object.entries(view.bestLap)
      .filter(([, v]) => v != null)
      .map(([n, v]) => ({ num: Number(n), best: v }))
      .sort((a, b) => a.best - b.best)

    const stamp = new Date(vt).toISOString()
    ranked.forEach((d, i) => {
      view.intervals[d.num] = {
        gap_to_leader: i === 0 ? 0 : +(d.best - ranked[0].best).toFixed(3),
        interval: i === 0 ? null : +(d.best - ranked[i - 1].best).toFixed(3),
        driver_number: d.num,
      }
      view.positions[d.num] = { position: i + 1, driver_number: d.num, date: stamp }
    })

    // Anyone without a lap yet sits at the back, in their entry order.
    let p = ranked.length
    for (const n of full.driverNums) {
      if (!view.positions[n] || view.bestLap[n] == null) {
        view.positions[n] = { position: ++p, driver_number: n, date: stamp }
      }
    }
  }

  // --- stints, pit stops and race control up to the virtual time ----------
  for (const [n, list] of Object.entries(full.stints)) {
    const lapNow = view.latestLap[n]?.lap_number ?? 0
    const upto = list.filter((s) => s.lap_start <= lapNow + 1)
    if (upto.length) view.stints[n] = upto
  }
  view.pits = full.pits.filter((p) => ms(p.date) <= vt)
  view.rc = full.rc.filter((r) => ms(r.date) <= vt)
  view.weather = [...(full.weatherHistory || [])].filter((w) => ms(w.date) <= vt).pop() || full.weather

  return view
}

/** Progress of a virtual clock through a session, 0..1. */
export function replayProgress(session, vt) {
  if (!session) return 0
  const a = ms(session.date_start), b = ms(session.date_end)
  return Math.max(0, Math.min(1, (vt - a) / Math.max(1, b - a)))
}

export const sessionSpan = (session) => ({
  start: ms(session.date_start),
  end: ms(session.date_end),
})
