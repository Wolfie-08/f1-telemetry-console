import { useEffect, useMemo, useState } from 'react'
import * as api from '../api/openf1.js'

// ---------------------------------------------------------------------------
// Season catalogue, blackout detection, and championship standings.
//
// The calendar is cached in localStorage, which is not an optimisation but a
// requirement: while a session is live the API answers 401 to anonymous
// callers, so without a cached calendar the console cannot even tell that a
// race is running -- it just sees requests fail and has nothing to say.
// ---------------------------------------------------------------------------

export const SEASONS = (() => {
  const thisYear = new Date().getUTCFullYear()
  const out = []
  for (let y = thisYear; y >= 2023; y--) out.push(y)
  return out
})()

const calKey = (year) => `f1console.calendar.${year}`
const readCal = (year) => {
  try { return JSON.parse(localStorage.getItem(calKey(year)) || 'null') } catch { return null }
}
const writeCal = (year, rows) => {
  try { localStorage.setItem(calKey(year), JSON.stringify(rows)) } catch { /* private mode */ }
}

export function useSeason(year) {
  const [sessions, setSessions] = useState(() => readCal(year) || [])
  const [fromCache, setFromCache] = useState(() => Boolean(readCal(year)))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let dead = false
    const cached = readCal(year)
    setSessions(cached || [])
    setFromCache(Boolean(cached))
    setLoading(true); setError(null)

    api.sessions({ year })
      .then((rows) => {
        if (dead) return
        const live = rows.filter((r) => !r.is_cancelled)
        setSessions(live)
        setFromCache(false)
        writeCal(year, live)
        setLoading(false)
      })
      .catch((e) => {
        if (dead) return
        setError(String(e.message || e))
        setLoading(false)
      })
    return () => { dead = true }
  }, [year, attempt])

  const rounds = useMemo(() => {
    const byMeeting = new Map()
    for (const s of sessions) {
      if (!byMeeting.has(s.meeting_key)) {
        byMeeting.set(s.meeting_key, {
          meetingKey: s.meeting_key,
          location: s.location,
          country: s.country_name,
          circuit: s.circuit_short_name,
          circuitKey: s.circuit_key,
          start: s.date_start,
          sessions: [],
        })
      }
      const m = byMeeting.get(s.meeting_key)
      m.sessions.push(s)
      if (s.date_start < m.start) m.start = s.date_start
    }
    const list = [...byMeeting.values()]
    list.sort((a, b) => new Date(a.start) - new Date(b.start))
    list.forEach((m, i) => {
      m.round = i + 1
      m.sessions.sort((a, b) => new Date(a.date_start) - new Date(b.date_start))
    })
    return list
  }, [sessions])

  const bucket = Math.floor(Date.now() / 15_000)   // re-evaluate every 15s

  const liveSession = useMemo(() => sessions.find((s) => {
    const now = Date.now()
    return now >= new Date(s.date_start).getTime() - 15 * 60_000
        && now <= new Date(s.date_end).getTime() + 20 * 60_000
  }), [sessions, bucket])

  const nextSession = useMemo(() => {
    const now = Date.now()
    return [...sessions]
      .filter((s) => new Date(s.date_start).getTime() > now)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))[0] || null
  }, [sessions, bucket])

  // The API is shut to anonymous callers while a session runs. If requests
  // are failing and the calendar says something is live, that -- not a broken
  // network -- is almost certainly what is happening.
  //
  // The harder case is a first visit DURING a blackout: there is no cached
  // calendar, so the console cannot name the session or count down to its
  // end. It still must not claim the season is empty, which is the one thing
  // it definitely is not.
  const blackout = useMemo(() => {
    const failing = api.stats.lastFailKind === 'offline' || api.stats.lastFailKind === 'blocked'
    if (!failing) return null
    if (api.stats.lastOkAt && Date.now() - api.stats.lastOkAt < 20_000) return null
    if (liveSession) {
      return {
        session: liveSession,
        // Access returns when the session ends; let the feed settle first.
        opensAt: new Date(liveSession.date_end).getTime() + 60_000,
        known: true,
      }
    }
    if (!sessions.length) return { session: null, opensAt: null, known: false }
    return null
  }, [liveSession, sessions.length, bucket,
      api.stats.lastFailKind, api.stats.lastOkAt, api.stats.failed])

  return {
    sessions, rounds, loading, error, fromCache,
    liveSession, nextSession, blackout,
    retry: () => setAttempt((n) => n + 1),
  }
}

/* -------------------------------------------------------------------------- */

const standKey = (year) => `f1console.standings.${year}`
const readCache = (year) => {
  try { return JSON.parse(localStorage.getItem(standKey(year)) || 'null') } catch { return null }
}
const writeCache = (year, value) => {
  try { localStorage.setItem(standKey(year), JSON.stringify(value)) } catch { /* private mode */ }
}

const teamColour = (c) => (c ? `#${String(c).replace('#', '')}` : '#8b95a5')

/**
 * Drivers' and constructors' championships.
 *
 * OpenF1 publishes championship_drivers / championship_teams, which is one
 * request and authoritative about sprint points and penalties. Older seasons
 * may not have it, so this falls back to summing each round's classification.
 */
export function useStandings(year, sessions, enabled) {
  const [state, setState] = useState({
    status: 'idle', drivers: [], teams: [], rounds: 0, progress: 0, source: null,
  })

  const scoring = useMemo(() => sessions
    .filter((s) => s.session_type === 'Race' && new Date(s.date_end).getTime() < Date.now())
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start)), [sessions])

  useEffect(() => {
    if (!enabled || !scoring.length) return
    let dead = false

    const cached = readCache(year)
    if (cached && cached.rounds === scoring.length) {
      setState({ status: 'ready', ...cached, progress: scoring.length })
      return
    }
    setState((s) => ({ ...s, status: 'loading', progress: 0 }))

    const last = scoring[scoring.length - 1]

    const publish = (payload, source) => {
      if (dead) return
      writeCache(year, { ...payload, source })
      setState({ status: 'ready', ...payload, source, progress: scoring.length })
    }

    ;(async () => {
      // --- preferred: the official tables ---------------------------------
      try {
        const [dRows, tRows] = [
          await api.championshipDrivers({ session_key: last.session_key }),
          await api.championshipTeams({ session_key: last.session_key }),
        ]
        if (dead) return
        if (dRows?.length) {
          const drivers = dRows
            .map((r) => ({
              num: r.driver_number,
              tla: r.name_acronym || r.driver_acronym || String(r.driver_number),
              name: r.full_name || r.driver_name || '',
              team: r.team_name || 'Unknown',
              color: teamColour(r.team_colour),
              points: r.points ?? 0,
              wins: r.wins ?? 0,
              podiums: r.podiums ?? 0,
              pos: r.position ?? null,
            }))
            .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99) || b.points - a.points)
          drivers.forEach((d, i) => { if (d.pos == null) d.pos = i + 1 })

          const teams = (tRows?.length ? tRows : [])
            .map((r) => ({
              team: r.team_name,
              color: teamColour(r.team_colour),
              points: r.points ?? 0,
              wins: r.wins ?? 0,
              pos: r.position ?? null,
              drivers: drivers.filter((d) => d.team === r.team_name).map((d) => d.tla),
            }))
            .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99) || b.points - a.points)
          teams.forEach((t, i) => { if (t.pos == null) t.pos = i + 1 })

          publish({ drivers, teams, rounds: scoring.length }, 'official')
          return
        }
      } catch { /* fall through to the manual tally */ }

      // --- fallback: sum every round's classification ----------------------
      try {
        const roster = await api.drivers({ session_key: last.session_key })
        const meta = {}
        for (const d of roster) {
          meta[d.driver_number] = {
            tla: d.name_acronym || String(d.driver_number),
            name: d.full_name || '',
            team: d.team_name || 'Unknown',
            color: teamColour(d.team_colour),
          }
        }

        const points = {}, wins = {}, podiums = {}
        let done = 0
        for (const s of scoring) {
          if (dead) return
          const rows = await api.sessionResult({ session_key: s.session_key })
          for (const r of rows) {
            const n = r.driver_number
            points[n] = (points[n] || 0) + (r.points || 0)
            if (r.position === 1) wins[n] = (wins[n] || 0) + 1
            if (r.position <= 3) podiums[n] = (podiums[n] || 0) + 1
          }
          done += 1
          if (!dead) setState((st) => ({ ...st, progress: done }))
        }
        if (dead) return

        const drivers = Object.keys(points).map((k) => {
          const n = Number(k)
          const m = meta[n] || { tla: String(n), name: '', team: 'Unknown', color: '#8b95a5' }
          return { num: n, ...m, points: points[n], wins: wins[n] || 0, podiums: podiums[n] || 0 }
        }).sort((a, b) => b.points - a.points || b.wins - a.wins)
        drivers.forEach((d, i) => { d.pos = i + 1 })

        const byTeam = {}
        for (const d of drivers) {
          const t = (byTeam[d.team] ||= { team: d.team, color: d.color, points: 0, wins: 0, drivers: [] })
          t.points += d.points
          t.wins += d.wins
          t.drivers.push(d.tla)
        }
        const teams = Object.values(byTeam).sort((a, b) => b.points - a.points || b.wins - a.wins)
        teams.forEach((t, i) => { t.pos = i + 1 })

        publish({ drivers, teams, rounds: scoring.length }, 'summed')
      } catch (e) {
        if (!dead) setState((s) => ({ ...s, status: 'error', error: String(e.message || e) }))
      }
    })()

    return () => { dead = true }
  }, [year, enabled, scoring.length])

  return { ...state, total: scoring.length }
}
