import { useEffect, useRef, useState, useCallback } from 'react'
import * as api from '../api/openf1.js'
import { apiDate, offsetToSeconds } from '../lib/format.js'

// ---------------------------------------------------------------------------
// The feed.
//
// One polling engine drives the whole dashboard. Resources are split into
// tiers by how fast they actually change, so the request budget stays well
// under OpenF1's 3 req/s ceiling:
//
//   fast   (5s)  location, intervals, position
//   mid   (10s)  laps
//   slow  (45s)  stints, pit, race_control, weather
//   cold (120s)  session_result
//
// The cadence is set by the per-MINUTE rate limit, not the per-second one.
// Live data needs an authorised key, which allows 60 req/min; these tiers
// come to roughly 48/min, leaving headroom for the compare view.
//
// Every incremental resource is fetched with a `date>` cursor so each poll
// returns only what is new. History is backfilled once on session load.
// ---------------------------------------------------------------------------

const FAST_MS = 5000
const MID_MS  = 10000
const SLOW_MS = 45000
const COLD_MS = 120000

const emptyStore = () => ({
  session: null,
  meeting: null,
  drivers: {},
  driverNums: [],
  lapsByDriver: {},
  latestLap: {},
  bestLap: {},
  bestSectors: {},
  sessionBestLap: null,
  sessionBestSectors: [null, null, null],
  intervals: {},
  positions: {},
  positionHistory: {},   // full trace, so replay can rewind the order
  weatherHistory: [],
  stints: {},
  pits: [],
  rc: [],
  weather: null,
  loc: {},
  result: [],
  lastSampleAt: null,
})

export function useRaceFeed(sessionKey) {
  const store = useRef(emptyStore())
  const cursors = useRef({})
  const timers = useRef([])
  const alive = useRef(true)

  const [phase, setPhase] = useState('idle')   // idle | loading | ready | error
  const [error, setError] = useState(null)

  // The store is a mutable ref, so nothing downstream can memoise on its
  // identity. `tick` is the single change signal: every ingest bumps it, and
  // every derived value in the tree depends on it.
  const [tick, setTick] = useState(0)
  const render = useCallback(() => { if (alive.current) setTick((n) => n + 1) }, [])

  // -- helpers ------------------------------------------------------------
  const ingestLaps = (rows) => {
    const s = store.current
    for (const l of rows) {
      const n = l.driver_number
      const list = (s.lapsByDriver[n] ||= [])
      const at = list.findIndex((x) => x.lap_number === l.lap_number)
      if (at >= 0) list[at] = l
      else list.push(l)

      const cur = s.latestLap[n]
      if (!cur || l.lap_number >= cur.lap_number) s.latestLap[n] = l

      if (l.lap_duration && (!s.bestLap[n] || l.lap_duration < s.bestLap[n])) {
        s.bestLap[n] = l.lap_duration
      }
      if (l.lap_duration && (!s.sessionBestLap || l.lap_duration < s.sessionBestLap.time)) {
        s.sessionBestLap = { time: l.lap_duration, driver: n, lap: l.lap_number }
      }
      const secs = [l.duration_sector_1, l.duration_sector_2, l.duration_sector_3]
      const pb = (s.bestSectors[n] ||= [null, null, null])
      secs.forEach((v, i) => {
        if (v == null) return
        if (pb[i] == null || v < pb[i]) pb[i] = v
        const sb = s.sessionBestSectors[i]
        if (sb == null || v < sb.time) s.sessionBestSectors[i] = { time: v, driver: n }
      })
      if (l.date_start && (!cursors.current.laps || l.date_start > cursors.current.laps)) {
        cursors.current.laps = l.date_start
      }
    }
    if (rows.length) s.lastSampleAt = Date.now()
  }

  const ingestIntervals = (rows) => {
    const s = store.current
    for (const r of rows) {
      s.intervals[r.driver_number] = r
      if (!cursors.current.intervals || r.date > cursors.current.intervals) {
        cursors.current.intervals = r.date
      }
    }
    if (rows.length) s.lastSampleAt = Date.now()
  }

  const ingestPositions = (rows) => {
    const s = store.current
    for (const r of rows) {
      const cur = s.positions[r.driver_number]
      if (!cur || r.date >= cur.date) s.positions[r.driver_number] = r
      ;(s.positionHistory[r.driver_number] ||= []).push(r)
      if (!cursors.current.positions || r.date > cursors.current.positions) {
        cursors.current.positions = r.date
      }
    }
  }

  const ingestLocation = (rows) => {
    const s = store.current
    for (const r of rows) {
      if (r.x == null) continue
      const cur = s.loc[r.driver_number]
      if (!cur || r.date >= cur.date) s.loc[r.driver_number] = r
    }
    if (rows.length) s.lastSampleAt = Date.now()
  }

  const ingestRc = (rows) => {
    const s = store.current
    if (!rows.length) return
    // The cursor is inclusive at the boundary and replays can repeat a
    // message, so dedupe on (timestamp, text) rather than trusting the filter.
    const seen = new Set(s.rc.map((r) => `${r.date}|${r.message}`))
    const fresh = rows.filter((r) => {
      const k = `${r.date}|${r.message}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (fresh.length) s.rc = [...s.rc, ...fresh].slice(-400)
    for (const r of rows) {
      if (!cursors.current.rc || r.date > cursors.current.rc) cursors.current.rc = r.date
    }
  }

  // -- polling ------------------------------------------------------------
  useEffect(() => {
    alive.current = true
    store.current = emptyStore()
    cursors.current = {}
    timers.current.forEach(clearInterval)
    timers.current = []
    if (!sessionKey) { setPhase('idle'); return }

    setPhase('loading')
    setError(null)

    const s = store.current
    let stopped = false

    const isLive = () => {
      if (!s.session) return false
      const now = Date.now()
      const start = new Date(s.session.date_start).getTime()
      const end = new Date(s.session.date_end).getTime()
      return now >= start - 10 * 60_000 && now <= end + 20 * 60_000
    }

    ;(async () => {
      try {
        // --- static context ------------------------------------------------
        const [sess] = await api.sessions({ session_key: sessionKey })
        if (stopped) return
        s.session = sess
        s.gmt = offsetToSeconds(sess?.gmt_offset)

        const [meet] = await api.meetings({ meeting_key: sess.meeting_key })
        if (stopped) return
        s.meeting = meet

        const drv = await api.drivers({ session_key: sessionKey })
        if (stopped) return
        for (const d of drv) s.drivers[d.driver_number] = d
        s.driverNums = drv.map((d) => d.driver_number)
        render()

        // --- history backfill ----------------------------------------------
        ingestLaps(await api.laps({ session_key: sessionKey }))
        render()
        ingestPositions(await api.positions({ session_key: sessionKey }))
        render()

        const st = await api.stints({ session_key: sessionKey })
        for (const x of st) (s.stints[x.driver_number] ||= []).push(x)
        for (const k of Object.keys(s.stints)) {
          s.stints[k].sort((a, b) => a.stint_number - b.stint_number)
        }

        s.pits = await api.pit({ session_key: sessionKey })
        ingestRc(await api.raceControl({ session_key: sessionKey }))
        const w = await api.weather({ session_key: sessionKey })
        s.weatherHistory = w
        if (w.length) { s.weather = w[w.length - 1]; cursors.current.weather = w[w.length - 1].date }
        ingestIntervals(await api.intervals({ session_key: sessionKey, 'date>': apiDate(Date.now() - 120_000) }))
        s.result = await api.sessionResult({ session_key: sessionKey })

        if (stopped) return
        setPhase('ready')
        render()

        if (!isLive()) return   // finished session: one full load, no polling

        // --- live tiers -----------------------------------------------------
        const guard = (fn) => async () => {
          if (stopped) return
          try { await fn() } catch (e) { setError(String(e.message || e)) }
          if (!stopped) render()
        }

        const fast = guard(async () => {
          ingestLocation(await api.location({
            session_key: sessionKey,
            'date>': apiDate(Date.now() - 30_000),
          }))
          ingestIntervals(await api.intervals({
            session_key: sessionKey,
            'date>': cursors.current.intervals || apiDate(Date.now() - 30_000),
          }))
          ingestPositions(await api.positions({
            session_key: sessionKey,
            'date>': cursors.current.positions || apiDate(Date.now() - 60_000),
          }))
        })

        const mid = guard(async () => {
          ingestLaps(await api.laps({
            session_key: sessionKey,
            'date_start>': cursors.current.laps || apiDate(Date.now() - 10 * 60_000),
          }))
        })

        const slow = guard(async () => {
          const st2 = await api.stints({ session_key: sessionKey })
          const next = {}
          for (const x of st2) (next[x.driver_number] ||= []).push(x)
          for (const k of Object.keys(next)) next[k].sort((a, b) => a.stint_number - b.stint_number)
          s.stints = next
          s.pits = await api.pit({ session_key: sessionKey })
          ingestRc(await api.raceControl({
            session_key: sessionKey,
            'date>': cursors.current.rc || apiDate(Date.now() - 10 * 60_000),
          }))
          const w2 = await api.weather({
            session_key: sessionKey,
            'date>': cursors.current.weather || apiDate(Date.now() - 10 * 60_000),
          })
          if (w2.length) {
            s.weatherHistory = [...s.weatherHistory, ...w2]
            s.weather = w2[w2.length - 1]
            cursors.current.weather = w2[w2.length - 1].date
          }
        })

        const cold = guard(async () => {
          s.result = await api.sessionResult({ session_key: sessionKey })
        })

        fast(); mid(); slow()
        timers.current.push(setInterval(fast, FAST_MS))
        timers.current.push(setInterval(mid, MID_MS))
        timers.current.push(setInterval(slow, SLOW_MS))
        timers.current.push(setInterval(cold, COLD_MS))
      } catch (e) {
        if (stopped) return
        setError(String(e.message || e))
        setPhase('error')
      }
    })()

    return () => {
      stopped = true
      alive.current = false
      timers.current.forEach(clearInterval)
      timers.current = []
    }
  }, [sessionKey, render])

  return { data: store.current, phase, error, tick, apiStats: api.stats }
}

/** Sessions list + auto-detection of whatever is running right now. */
export function useSessionCatalog(year) {
  const [list, setList] = useState([])
  const [err, setErr] = useState(null)
  useEffect(() => {
    let dead = false
    api.sessions({ year })
      .then((rows) => { if (!dead) setList(rows.filter((r) => !r.is_cancelled)) })
      .catch((e) => !dead && setErr(String(e.message || e)))
    return () => { dead = true }
  }, [year])

  const now = Date.now()
  const liveOne = list.find((s) => {
    const a = new Date(s.date_start).getTime() - 15 * 60_000
    const b = new Date(s.date_end).getTime() + 20 * 60_000
    return now >= a && now <= b
  })
  const past = [...list].filter((s) => new Date(s.date_start).getTime() <= now)
  const latest = past[past.length - 1]
  const next = list.find((s) => new Date(s.date_start).getTime() > now)

  return { list, live: liveOne, latest, next, error: err }
}
