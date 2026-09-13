import React, { useEffect, useState } from 'react'
import { offsetToSeconds } from '../lib/format.js'

const pad = (n) => String(Math.floor(n)).padStart(2, '0')

/** Shown when nothing is running: what is next, and how long until it starts. */
export default function Countdown({ next, onOpenArchive }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (!next) {
    return (
      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <div className="panel-head"><span className="label">No live session</span></div>
        <div className="hint">
          Nothing is running and no further sessions are scheduled this season.
          Open the archive to replay a past race.
        </div>
      </div>
    )
  }

  const start = new Date(next.date_start).getTime()
  const left = Math.max(0, start - Date.now())
  const d = left / 86400000
  const h = (left % 86400000) / 3600000
  const m = (left % 3600000) / 60000
  const s = (left % 60000) / 1000

  // Local wall-clock time for the viewer, and for the circuit.
  const viewer = new Date(start).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
  const circuitClock = new Date(start + offsetToSeconds(next.gmt_offset) * 1000)
    .toISOString().slice(11, 16)

  return (
    <div className="panel idle" style={{ gridColumn: '1 / -1' }}>
      <div className="panel-head">
        <span className="label">No session running</span>
        <span className="label">come back for</span>
      </div>
      <div className="idle-body">
        <div className="idle-next">
          <span className="label">Next up</span>
          <h1>{next.location}</h1>
          <h2>{next.circuit_short_name} · {next.session_name}</h2>
        </div>

        <div className="idle-clock mono">
          {d >= 1 && <span><b>{pad(d)}</b><i>days</i></span>}
          <span><b>{pad(h)}</b><i>hrs</i></span>
          <span><b>{pad(m)}</b><i>min</i></span>
          <span><b>{pad(s)}</b><i>sec</i></span>
        </div>

        <div className="idle-when">
          <div><span className="label">Your time</span><span className="mono">{viewer}</span></div>
          <div><span className="label">Circuit time</span><span className="mono">{circuitClock}</span></div>
        </div>

        <button onClick={onOpenArchive} style={{ padding: '8px 14px', fontSize: 12 }}>
          Replay a past session instead →
        </button>
      </div>
    </div>
  )
}
