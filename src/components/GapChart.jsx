import React, { useMemo } from 'react'
import { gapTraces } from '../lib/derive.js'

const W = 900, H = 300, M = { t: 12, r: 14, b: 22, l: 44 }

/**
 * Race trace: cumulative gap to the lap leader, per lap.
 * Flat lines = matched pace; a step = a pit stop; a slope = real pace delta.
 */
export default function GapChart({ store, rows, selected, tick }) {
  const nums = rows.slice(0, 12).map((r) => r.num)
  const { traces, maxLap } = useMemo(() => gapTraces(store, nums), [store, nums.join(','), tick])

  const maxGap = useMemo(() => {
    let m = 5
    for (const t of traces) for (const p of t.points) if (p.gap > m) m = p.gap
    return Math.min(m, 180)
  }, [traces])

  const x = (lap) => M.l + (lap / Math.max(maxLap, 1)) * (W - M.l - M.r)
  const y = (g) => M.t + (g / maxGap) * (H - M.t - M.b)

  const yTicks = 4
  const colorOf = (n) => rows.find((r) => r.num === n)?.color || '#666'

  return (
    <div className="panel a-gaps">
      <div className="panel-head">
        <span className="label">Race Trace — gap to leader</span>
        <span className="label">top {nums.length}</span>
      </div>
      <div className="panel-body" style={{ overflow: 'hidden' }}>
        {traces.length ? (
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {Array.from({ length: yTicks + 1 }, (_, i) => {
              const g = (maxGap / yTicks) * i
              return (
                <g key={i}>
                  <line className="grid-line" x1={M.l} x2={W - M.r} y1={y(g)} y2={y(g)} />
                  <text className="axis-text" x={M.l - 6} y={y(g) + 3} textAnchor="end">
                    {g === 0 ? '0' : `+${g.toFixed(0)}s`}
                  </text>
                </g>
              )
            })}
            {[1, Math.round(maxLap / 2), maxLap].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((lap) => (
              <text key={lap} className="axis-text" x={x(lap)} y={H - 6} textAnchor="middle">L{lap}</text>
            ))}
            {traces.map((t) => {
              const on = selected.includes(t.num)
              return (
                <path
                  key={t.num}
                  d={t.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.lap).toFixed(1)} ${y(Math.min(p.gap, maxGap)).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={colorOf(t.num)}
                  strokeWidth={on ? 2.6 : 1.2}
                  opacity={selected.length ? (on ? 1 : 0.25) : 0.85}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
        ) : (
          <div className="hint">Race trace builds once cars have completed two timed laps.</div>
        )}
      </div>
    </div>
  )
}
