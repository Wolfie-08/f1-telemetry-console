import React from 'react'
import { tyre } from '../lib/constants.js'

/** Tyre strategy: one bar per driver, segmented by stint, pit stops marked. */
export default function StintBars({ store, rows, maxLap }) {
  const total = Math.max(maxLap, 1)
  return (
    <div className="panel a-stints">
      <div className="panel-head">
        <span className="label">Tyre Strategy</span>
        <span className="label">lap {maxLap}</span>
      </div>
      <div className="panel-body scroll" style={{ paddingTop: 4, paddingBottom: 6 }}>
        {rows.map((r) => {
          const stints = store.stints[r.num] || []
          const pits = store.pits.filter((p) => p.driver_number === r.num)
          return (
            <div className="stint-row" key={r.num}>
              <span className="mono" style={{ fontSize: 11, color: r.color, fontWeight: 700 }}>
                {r.tla}
              </span>
              <div className="stint-track">
                {stints.map((s, i) => {
                  const start = Math.max(0, s.lap_start - 1)
                  const end = Math.min(total, s.lap_end ?? maxLap)
                  const t = tyre(s.compound)
                  return (
                    <div
                      key={i}
                      className="stint-seg"
                      title={`${s.compound} · L${s.lap_start}-${s.lap_end ?? '…'}`}
                      style={{
                        left: `${(start / total) * 100}%`,
                        width: `${Math.max(0.6, ((end - start) / total) * 100)}%`,
                        background: t.color,
                        opacity: 0.85,
                      }}
                    />
                  )
                })}
                {pits.map((p, i) => (
                  <div key={i} className="stint-pit"
                       title={`Stop ${i + 1} · L${p.lap_number} · ${p.pit_duration?.toFixed(1)}s`}
                       style={{ left: `${((p.lap_number - 1) / total) * 100}%` }} />
                ))}
              </div>
            </div>
          )
        })}
        {!rows.length && <div className="hint">No stint data yet.</div>}
      </div>
    </div>
  )
}
