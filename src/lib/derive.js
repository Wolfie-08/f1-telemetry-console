import { FALLBACK_TEAM } from './constants.js'

/**
 * Flatten the feed store into display rows for the timing tower,
 * sorted by live classification.
 */
export function towerRows(s, nowMs = Date.now()) {
  const rows = s.driverNums.map((n) => {
    const d = s.drivers[n] || {}
    const last = s.latestLap[n] || null
    const iv = s.intervals[n] || null
    const posRow = s.positions[n] || null
    const stintList = s.stints[n] || []
    const stint = stintList[stintList.length - 1] || null
    const myPits = s.pits.filter((p) => p.driver_number === n)
    const lastPit = myPits[myPits.length - 1] || null

    // "In pit" while a stop is fresh, or on the out-lap that follows it.
    const pitFresh = lastPit && (nowMs - new Date(lastPit.date).getTime()) < 35_000
    const inPit = Boolean(pitFresh || (last && last.is_pit_out_lap && !last.lap_duration))

    const secs = last
      ? [last.duration_sector_1, last.duration_sector_2, last.duration_sector_3]
      : [null, null, null]
    const segs = last
      ? [last.segments_sector_1, last.segments_sector_2, last.segments_sector_3]
      : [null, null, null]

    const pb = s.bestSectors[n] || [null, null, null]
    const sectorClass = secs.map((v, i) => {
      if (v == null) return 'dim'
      const sb = s.sessionBestSectors[i]
      if (sb && Math.abs(sb.time - v) < 1e-6 && sb.driver === n) return 'sb'
      if (pb[i] != null && Math.abs(pb[i] - v) < 1e-6) return 'pb'
      return 'neu'
    })

    const best = s.bestLap[n] ?? null
    const lapClass =
      last?.lap_duration == null ? 'dim'
      : (s.sessionBestLap && s.sessionBestLap.driver === n
         && Math.abs(s.sessionBestLap.time - last.lap_duration) < 1e-6) ? 'sb'
      : (best != null && Math.abs(best - last.lap_duration) < 1e-6) ? 'pb'
      : 'neu'

    const res = s.result.find((r) => r.driver_number === n) || null

    return {
      num: n,
      tla: d.name_acronym || String(n),
      name: d.full_name || '',
      team: d.team_name || '',
      color: d.team_colour ? `#${d.team_colour}` : FALLBACK_TEAM,
      pos: posRow?.position ?? res?.position ?? 99,
      lapNumber: last?.lap_number ?? 0,
      gapLeader: iv?.gap_to_leader ?? null,
      interval: iv?.interval ?? null,
      lastLap: last?.lap_duration ?? null,
      lapClass,
      bestLap: best,
      secs, segs, sectorClass,
      compound: stint?.compound ?? null,
      tyreAge: stint ? (stint.tyre_age_at_start ?? 0) + Math.max(0, (last?.lap_number ?? stint.lap_start) - stint.lap_start) : null,
      stops: myPits.length,
      inPit,
      speedTrap: last?.st_speed ?? null,
      retired: Boolean(res?.dnf || res?.dns || res?.dsq),
    }
  })

  rows.sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1
    return a.pos - b.pos
  })
  return rows
}

/** Leader's lap number — the race's lap counter. */
export function leaderLap(s) {
  let max = 0
  for (const n of s.driverNums) {
    const l = s.latestLap[n]
    if (l && l.lap_number > max) max = l.lap_number
  }
  return max
}

/** Most recent meaningful track status from the race-control feed. */
export function trackStatus(s) {
  for (let i = s.rc.length - 1; i >= 0; i--) {
    const r = s.rc[i]
    if (r.category === 'Flag' && r.scope === 'Track' && r.flag) {
      return r.flag.toUpperCase().replace(/\s+/g, '_')
    }
    if (r.category === 'SafetyCar') {
      if (/VIRTUAL/i.test(r.message || '')) {
        return /ENDING|DEPLOYED/i.test(r.message) && /ENDING/i.test(r.message) ? 'VSC_ENDING' : 'VSC'
      }
      return /IN THIS LAP|ENDING/i.test(r.message || '') ? 'SC_ENDING' : 'SC'
    }
  }
  return 'CLEAR'
}

/** Gap-to-leader per lap, per driver, for the race-trace chart. */
export function gapTraces(s, drivers) {
  const out = []
  for (const n of drivers) {
    const laps = (s.lapsByDriver[n] || []).filter((l) => l.lap_duration)
    if (laps.length < 2) continue
    out.push({ num: n, laps })
  }
  if (!out.length) return { traces: [], maxLap: 0 }

  // Cumulative elapsed time per driver per lap, referenced to the leader.
  const cum = {}
  let maxLap = 0
  for (const { num, laps } of out) {
    let t = 0
    const series = []
    for (const l of laps.sort((a, b) => a.lap_number - b.lap_number)) {
      t += l.lap_duration
      series.push({ lap: l.lap_number, t })
      if (l.lap_number > maxLap) maxLap = l.lap_number
    }
    cum[num] = series
  }
  const refByLap = {}
  for (let lap = 1; lap <= maxLap; lap++) {
    let best = Infinity
    for (const num of Object.keys(cum)) {
      const p = cum[num].find((x) => x.lap === lap)
      if (p && p.t < best) best = p.t
    }
    if (isFinite(best)) refByLap[lap] = best
  }
  const traces = Object.entries(cum).map(([num, series]) => ({
    num: Number(num),
    points: series
      .filter((p) => refByLap[p.lap] != null)
      .map((p) => ({ lap: p.lap, gap: p.t - refByLap[p.lap] })),
  }))
  return { traces, maxLap }
}
