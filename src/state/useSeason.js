import { useEffect, useMemo, useState } from 'react'
import * as api from '../api/openf1.js'

// ---------------------------------------------------------------------------
// Season catalogue and championship standings.
//
// OpenF1 has no standings endpoint, but every race's /session_result carries
// the points awarded, so the championship is just those summed across the
// season. That is one request per race weekend, which is why the result is
// cached in localStorage and only recomputed when another race has finished.
// ---------------------------------------------------------------------------

export const SEASONS = (() => {
  const thisYear = new Date().getUTCFullYear()
  const out = []
  for (let y = thisYear; y >= 2023; y--) out.push(y)
  return out
})()

/** Sessions for a season, grouped into rounds (meetings) in calendar order. */
export function useSeason(year) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let dead = false
    setLoading(true); setError(null)
    api.sessions({ year })
      .then((rows) => {
        if (dead) return
        setSessions(rows.filter((r) => !r.is_cancelled))
        setLoading(false)
      })
      .catch((e) => { if (!dead) { setError(String(e.message || e)); setLoading(false) } })
    return () => { dead = true }
  }, [year])

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

  const now = Date.now()

  /** A session counts as live from 15 min before its start to 20 min after. */
  const liveSession = useMemo(() => sessions.find((s) => {
    const a = new Date(s.date_start).getTime() - 15 * 60_000
    const b = new Date(s.date_end).getTime() + 20 * 60_000
    return now >= a && now <= b
  }), [sessions, Math.floor(now / 30_000)])

  const nextSession = useMemo(() => {
    const future = sessions
      .filter((s) => new Date(s.date_start).getTime() > now)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))
    return future[0] || null
  }, [sessions, Math.floor(now / 30_000)])

  const lastSession = useMemo(() => {
    const past = sessions
      .filter((s) => new Date(s.date_start).getTime() <= now)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))
    return past[past.length - 1] || null
  }, [sessions, Math.floor(now / 30_000)])

  return { sessions, rounds, loading, error, liveSession, nextSession, lastSession }
}

/* -------------------------------------------------------------------------- */

const cacheKey = (year) => `f1console.standings.${year}`

const readCache = (year) => {
  try { return JSON.parse(localStorage.getItem(cacheKey(year)) || 'null') } catch { return null }
}
const writeCache = (year, value) => {
  try { localStorage.setItem(cacheKey(year), JSON.stringify(value)) } catch { /* private mode */ }
}

/**
 * Drivers' and constructors' championships for a season.
 * @param {number} year
 * @param {Array}  sessions  the season's sessions (from useSeason)
 * @param {boolean} enabled  only fetch when the standings view is open
 */
export function useStandings(year, sessions, enabled) {
  const [state, setState] = useState({ status: 'idle', drivers: [], teams: [], rounds: 0, progress: 0 })

  // Points-scoring sessions: the grand prix itself plus any sprint.
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

    ;(async () => {
      try {
        // Team identity comes from the most recent session's driver list —
        // mid-season swaps mean the latest entry is the one worth showing.
        const last = scoring[scoring.length - 1]
        const roster = await api.drivers({ session_key: last.session_key })
        const meta = {}
        for (const d of roster) {
          meta[d.driver_number] = {
            tla: d.name_acronym || String(d.driver_number),
            name: d.full_name || '',
            team: d.team_name || 'Unknown',
            color: d.team_colour ? `#${d.team_colour}` : '#8b95a5',
          }
        }

        const points = {}
        const wins = {}
        const podiums = {}
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

        const payload = { drivers, teams, rounds: scoring.length }
        writeCache(year, payload)
        setState({ status: 'ready', ...payload, progress: scoring.length })
      } catch (e) {
        if (!dead) setState((s) => ({ ...s, status: 'error', error: String(e.message || e) }))
      }
    })()

    return () => { dead = true }
  }, [year, enabled, scoring.length])

  return { ...state, total: scoring.length }
}
