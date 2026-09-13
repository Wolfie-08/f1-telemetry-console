import { useEffect, useRef, useState, useCallback } from 'react'
import * as api from '../api/openf1.js'
import { apiDate } from '../lib/format.js'
import { sessionSpan } from '../lib/replay.js'

// ---------------------------------------------------------------------------
// The replay transport: a virtual clock over a finished session, plus the one
// thing that cannot be precomputed -- a short window of car positions around
// wherever the clock currently is.
// ---------------------------------------------------------------------------

const TICK_MS = 400
const SPEEDS = [1, 2, 5, 10, 30, 60]
export { SPEEDS }

export function useReplay(session, ready) {
  const [vt, setVt] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(10)
  const [loc, setLoc] = useState({})
  const raf = useRef(null)
  const lastReal = useRef(0)
  const lastLocFetch = useRef(0)

  // Park the clock at the start of the session whenever one is loaded.
  useEffect(() => {
    if (!session || !ready) { setVt(null); setPlaying(false); return }
    setVt(sessionSpan(session).start)
    setLoc({})
  }, [session?.session_key, ready])

  // Advance the clock.
  useEffect(() => {
    if (!playing || !session || vt == null) return
    lastReal.current = Date.now()
    const id = setInterval(() => {
      const now = Date.now()
      const dt = now - lastReal.current
      lastReal.current = now
      setVt((cur) => {
        const { end } = sessionSpan(session)
        const next = cur + dt * speed
        if (next >= end) { setPlaying(false); return end }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [playing, speed, session?.session_key, vt == null])

  // Pull the cars' positions for wherever the clock is now. Replay makes no
  // other requests, so one every 2.5s sits inside even the community tier's
  // 30/min budget, at any playback speed.
  useEffect(() => {
    if (!session || vt == null) return
    const now = Date.now()
    if (now - lastLocFetch.current < 2500) return
    lastLocFetch.current = now
    let dead = false
    api.location({
      session_key: session.session_key,
      'date>': apiDate(vt - 1500),
      'date<': apiDate(vt + 1500),
    }).then((rows) => {
      if (dead) return
      const next = {}
      for (const r of rows) {
        if (r.x == null) continue
        const cur = next[r.driver_number]
        if (!cur || r.date >= cur.date) next[r.driver_number] = r
      }
      if (Object.keys(next).length) setLoc(next)
    }).catch(() => {})
    return () => { dead = true }
  }, [session?.session_key, vt == null ? null : Math.floor(vt / 1000)])

  const seek = useCallback((fraction) => {
    if (!session) return
    const { start, end } = sessionSpan(session)
    setVt(start + (end - start) * Math.max(0, Math.min(1, fraction)))
  }, [session?.session_key])

  const nudge = useCallback((seconds) => {
    if (!session) return
    const { start, end } = sessionSpan(session)
    setVt((cur) => Math.max(start, Math.min(end, cur + seconds * 1000)))
  }, [session?.session_key])

  return { vt, playing, setPlaying, speed, setSpeed, loc, seek, nudge }
}
