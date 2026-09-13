import React, { useMemo } from 'react'
import { MADRING, TRACKS, bounds, pathData, project } from '../lib/track.js'

/**
 * Live positions on the circuit outline. The outline and the /location feed
 * share the same coordinate frame, so cars are plotted directly — no fitting.
 */
export default function TrackMap({ store, rows, selected, live }) {
  const circuit = TRACKS[store.session?.circuit_key] || MADRING
  const { rotation, points } = circuit

  const view = useMemo(() => bounds(points, rotation, 700), [points, rotation])
  const d = useMemo(() => pathData(points, rotation), [points, rotation])

  const byNum = useMemo(() => {
    const m = {}
    for (const r of rows) m[r.num] = r
    return m
  }, [rows])

  const cars = Object.entries(store.loc)
    .map(([num, p]) => ({ num: Number(num), ...p }))
    .filter((c) => byNum[c.num])

  const R = Math.max(view.w, view.h) * 0.016

  return (
    <div className="panel a-map">
      <div className="panel-head">
        <span className="label">{circuit.name} — Live Positions</span>
        <span className="label">{live ? `${cars.length} tracked` : 'session closed'}</span>
      </div>
      <div className="panel-body" style={{ overflow: 'hidden' }}>
        <div className="map-wrap">
          <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet">
            {/* track bed */}
            <path d={d} fill="none" stroke="#1d242f" strokeWidth={R * 2.5}
                  strokeLinejoin="round" strokeLinecap="round" />
            <path d={d} fill="none" stroke="#2c3644" strokeWidth={R * 0.55}
                  strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${R * 3} ${R * 3}`} />

            {/* start / finish */}
            {points.length > 0 && (() => {
              const [sx, sy] = project(points[0], rotation)
              const [nx, ny] = project(points[4] || points[1], rotation)
              const ang = Math.atan2(ny - sy, nx - sx) + Math.PI / 2
              const L = R * 2.6
              return (
                <line
                  x1={sx + Math.cos(ang) * L} y1={sy + Math.sin(ang) * L}
                  x2={sx - Math.cos(ang) * L} y2={sy - Math.sin(ang) * L}
                  stroke="#e8e8e8" strokeWidth={R * 0.6}
                />
              )
            })()}

            {/* cars */}
            {cars.map((c) => {
              const [cx, cy] = project([c.x, c.y], rotation)
              const r = byNum[c.num]
              const isSel = selected.includes(c.num)
              return (
                <g key={c.num}>
                  <circle
                    className="car-dot"
                    cx={cx} cy={cy} r={isSel ? R * 1.55 : R * 1.15}
                    fill={r.color}
                    stroke={isSel ? '#ffffff' : '#0a0d12'}
                    strokeWidth={isSel ? R * 0.4 : R * 0.22}
                    opacity={r.inPit ? 0.45 : 1}
                  />
                  {isSel && (
                    <text className="car-label" x={cx} y={cy}
                          style={{ fontSize: R * 1.5 }}>{r.tla}</text>
                  )}
                </g>
              )
            })}
          </svg>
          {!cars.length && (
            <div className="hint" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              {live ? 'Waiting for position data…' : 'No live positions — session is not running.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
