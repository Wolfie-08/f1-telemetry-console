import React, { useEffect, useMemo, useState } from 'react'
import * as api from '../api/openf1.js'
import { apiDate, lapTime, sector, delta } from '../lib/format.js'
import {
  buildTrace, onGrid, deltaCurve, findCorners, cornerDeltas, speedPath, speedColor,
} from '../lib/telemetry.js'
import { project, bounds } from '../lib/track.js'

const A_COLOR = '#00d8c0'
const B_COLOR = '#b45cff'

/** Fetch car_data + location for one driver's lap. */
async function loadLap(sessionKey, driverNumber, lap) {
  if (!lap?.date_start || !lap?.lap_duration) return null
  const t0 = new Date(lap.date_start).getTime()
  const t1 = t0 + lap.lap_duration * 1000
  const q = {
    session_key: sessionKey,
    driver_number: driverNumber,
    'date>': apiDate(t0 - 300),
    'date<': apiDate(t1 + 300),
  }
  const car = await api.carData(q)
  const loc = await api.location(q)
  const trace = buildTrace(car)
  return trace ? { trace, grid: onGrid(trace), loc, lap } : null
}

function LapSelect({ laps, value, onChange, color }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ borderColor: color, color: 'var(--text)' }}
    >
      {laps.map((l) => (
        <option key={l.lap_number} value={l.lap_number}>
          L{l.lap_number} · {lapTime(l.lap_duration)}
        </option>
      ))}
    </select>
  )
}

export default function ComparePanel({ store, rows, sessionKey, selected, setSelected }) {
  const [a, b] = selected
  const [lapA, setLapA] = useState(null)
  const [lapB, setLapB] = useState(null)
  const [dataA, setDataA] = useState(null)
  const [dataB, setDataB] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const timedLaps = (n) =>
    (store.lapsByDriver[n] || [])
      .filter((l) => l.lap_duration && l.date_start)
      .sort((x, y) => x.lap_number - y.lap_number)

  const lapsA = a ? timedLaps(a) : []
  const lapsB = b ? timedLaps(b) : []

  // Default each driver to their own fastest lap.
  useEffect(() => {
    if (!lapsA.length) { setLapA(null); return }
    if (!lapsA.some((l) => l.lap_number === lapA)) {
      setLapA([...lapsA].sort((x, y) => x.lap_duration - y.lap_duration)[0].lap_number)
    }
  }, [a, lapsA.length])

  useEffect(() => {
    if (!lapsB.length) { setLapB(null); return }
    if (!lapsB.some((l) => l.lap_number === lapB)) {
      setLapB([...lapsB].sort((x, y) => x.lap_duration - y.lap_duration)[0].lap_number)
    }
  }, [b, lapsB.length])

  // Load telemetry whenever the selection changes.
  useEffect(() => {
    let dead = false
    const la = lapsA.find((l) => l.lap_number === lapA)
    const lb = lapsB.find((l) => l.lap_number === lapB)
    if (!a || !la) { setDataA(null); return }
    setBusy(true); setErr(null)
    ;(async () => {
      try {
        const da = await loadLap(sessionKey, a, la)
        if (!dead) setDataA(da)
        if (b && lb) {
          const db = await loadLap(sessionKey, b, lb)
          if (!dead) setDataB(db)
        } else if (!dead) setDataB(null)
      } catch (e) {
        if (!dead) setErr(String(e.message || e))
      } finally {
        if (!dead) setBusy(false)
      }
    })()
    return () => { dead = true }
  }, [a, b, lapA, lapB, sessionKey])

  const curve = useMemo(
    () => (dataA && dataB ? deltaCurve(dataA.grid, dataB.grid) : null),
    [dataA, dataB],
  )
  const corners = useMemo(() => (dataA ? findCorners(dataA.grid) : []), [dataA])
  const cDeltas = useMemo(() => cornerDeltas(corners, curve), [corners, curve])

  const rowOf = (n) => rows.find((r) => r.num === n)
  const pathA = useMemo(
    () => (dataA ? speedPath(dataA.loc, dataA.trace) : []),
    [dataA],
  )

  const assign = (n) => {
    if (selected.includes(n)) setSelected(selected.filter((x) => x !== n))
    else if (selected.length < 2) setSelected([...selected, n])
    else setSelected([selected[1], n])
  }

  return (
    <>
      <div className="cmp-side">
        <div className="panel" style={{ flex: '1 1 auto' }}>
          <div className="panel-head">
            <span className="label">Drivers</span>
            <span className="label">pick 2</span>
          </div>
          <div className="panel-body scroll">
            {rows.map((r) => {
              const slot = selected.indexOf(r.num)
              return (
                <div
                  key={r.num}
                  className={`drv-pick ${slot === 0 ? 'a' : slot === 1 ? 'b' : ''}`}
                  onClick={() => assign(r.num)}
                >
                  <span style={{ width: 3, height: 14, background: r.color, display: 'inline-block' }} />
                  <span style={{ color: 'var(--dim)', width: 20, textAlign: 'right' }}>{r.pos}</span>
                  <b style={{ letterSpacing: '0.04em' }}>{r.tla}</b>
                  <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 11 }}>
                    {r.bestLap ? lapTime(r.bestLap) : '--'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel" style={{ flex: '0 0 auto' }}>
          <div className="panel-head"><span className="label">Laps</span></div>
          <div style={{ padding: 8, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <b style={{ color: A_COLOR, width: 34 }}>{a ? rowOf(a)?.tla : '—'}</b>
              {lapsA.length ? <LapSelect laps={lapsA} value={lapA} onChange={setLapA} color={A_COLOR} /> : <span className="label">no timed laps</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <b style={{ color: B_COLOR, width: 34 }}>{b ? rowOf(b)?.tla : '—'}</b>
              {lapsB.length ? <LapSelect laps={lapsB} value={lapB} onChange={setLapB} color={B_COLOR} /> : <span className="label">no timed laps</span>}
            </div>
          </div>
          {dataA && (
            <>
              <div className="kv">
                <span style={{ color: A_COLOR }}>{rowOf(a)?.tla} lap</span>
                <span>{lapTime(dataA.lap.lap_duration)}</span>
              </div>
              {dataB && (
                <>
                  <div className="kv">
                    <span style={{ color: B_COLOR }}>{rowOf(b)?.tla} lap</span>
                    <span>{lapTime(dataB.lap.lap_duration)}</span>
                  </div>
                  <div className="kv">
                    <span>Difference</span>
                    <span style={{ color: dataB.lap.lap_duration > dataA.lap.lap_duration ? 'var(--red)' : 'var(--green)' }}>
                      {delta(dataB.lap.lap_duration - dataA.lap.lap_duration)}
                    </span>
                  </div>
                </>
              )}
              <div className="kv"><span>Top speed</span><span>{Math.round(Math.max(...dataA.grid.speed))} km/h</span></div>
              <div className="kv"><span>Corners found</span><span>{corners.length}</span></div>
              {[1, 2, 3].map((i) => (
                <div className="kv" key={i}>
                  <span>S{i}</span>
                  <span>
                    <span style={{ color: A_COLOR }}>{sector(dataA.lap[`duration_sector_${i}`])}</span>
                    {dataB && <>
                      {'  '}
                      <span style={{ color: B_COLOR }}>{sector(dataB.lap[`duration_sector_${i}`])}</span>
                    </>}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="cmp-stack">
        <SpeedMap store={store} path={pathA} corners={corners} grid={dataA?.grid} busy={busy} err={err} />
        <Traces dataA={dataA} dataB={dataB} rowOf={rowOf} a={a} b={b} corners={corners} />
        <DeltaBars curve={curve} cDeltas={cDeltas} dataA={dataA} dataB={dataB} rowOf={rowOf} a={a} b={b} />
      </div>
    </>
  )
}

/* ---- track map coloured by speed ---------------------------------------- */

function SpeedMap({ store, path, corners, grid, busy, err }) {
  const rotation = 90
  const view = useMemo(
    () => (path.length ? bounds(path.map((p) => [p.x, p.y]), rotation, 700) : null),
    [path],
  )
  const [vMin, vMax] = useMemo(() => {
    if (!path.length) return [0, 1]
    const sp = path.map((p) => p.speed)
    return [Math.min(...sp), Math.max(...sp)]
  }, [path])

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Reference lap — speed map</span>
        <span className="label">
          {busy ? 'loading telemetry…' : err ? err : path.length ? `${Math.round(vMin)}–${Math.round(vMax)} km/h` : ''}
        </span>
      </div>
      <div className="panel-body" style={{ overflow: 'hidden' }}>
        {view ? (
          <div className="map-wrap">
            <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet">
              {path.slice(1).map((p, i) => {
                const [x1, y1] = project([path[i].x, path[i].y], rotation)
                const [x2, y2] = project([p.x, p.y], rotation)
                if (Math.hypot(x2 - x1, y2 - y1) > 2500) return null
                return (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={speedColor(p.speed, vMin, vMax)}
                        strokeWidth={Math.max(view.w, view.h) * 0.014}
                        strokeLinecap="round" />
                )
              })}
              {grid && corners.map((c) => {
                const f = c.apex / (grid.speed.length - 1)
                const idx = Math.round(f * (path.length - 1))
                const p = path[idx]
                if (!p) return null
                const [cx, cy] = project([p.x, p.y], rotation)
                const R = Math.max(view.w, view.h)
                return (
                  <g key={c.index}>
                    <circle cx={cx} cy={cy} r={R * 0.016} fill="#0a0d12" stroke="#4a5568" />
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                          fill="#9aa6b8" style={{ fontSize: R * 0.022, fontFamily: 'var(--mono)' }}>
                      {c.index}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        ) : (
          <div className="hint">
            {busy ? 'Fetching car telemetry…' : 'Select a driver on the left to load a reference lap.'}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---- speed / pedal traces ------------------------------------------------ */

function Traces({ dataA, dataB, rowOf, a, b, corners }) {
  const W = 1000, H = 260
  const top = { t: 10, h: 150 }, bot = { t: 170, h: 76 }
  const L = 40, R = 10

  if (!dataA) return <div className="panel"><div className="panel-head"><span className="label">Traces</span></div><div className="hint">No lap loaded.</div></div>

  const gA = dataA.grid, gB = dataB?.grid
  const n = gA.speed.length
  const vMax = Math.max(...gA.speed, ...(gB ? gB.speed : [0])) * 1.05
  const x = (i) => L + (i / (n - 1)) * (W - L - R)
  const ySpeed = (v) => top.t + top.h - (v / vMax) * top.h
  const yPct = (v) => bot.t + bot.h - (v / 100) * bot.h

  const line = (arr, fn) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${fn(v).toFixed(1)}`).join(' ')

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Speed / throttle / brake</span>
        <span className="label">
          <span style={{ color: A_COLOR }}>{rowOf(a)?.tla}</span>
          {dataB && <> vs <span style={{ color: B_COLOR }}>{rowOf(b)?.tla}</span></>}
        </span>
      </div>
      <div className="panel-body" style={{ overflow: 'hidden' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {corners.map((c) => (
            <rect key={c.index} x={x(c.start)} y={top.t} width={Math.max(1, x(c.end) - x(c.start))}
                  height={top.h + bot.h + 20} fill="#ffffff" opacity="0.028" />
          ))}
          {[0, 100, 200, 300].filter((v) => v <= vMax).map((v) => (
            <g key={v}>
              <line className="grid-line" x1={L} x2={W - R} y1={ySpeed(v)} y2={ySpeed(v)} />
              <text className="axis-text" x={L - 5} y={ySpeed(v) + 3} textAnchor="end">{v}</text>
            </g>
          ))}
          {gB && <path d={line(gB.speed, ySpeed)} fill="none" stroke={B_COLOR} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />}
          <path d={line(gA.speed, ySpeed)} fill="none" stroke={A_COLOR} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />

          <line className="axis-line" x1={L} x2={W - R} y1={bot.t + bot.h} y2={bot.t + bot.h} />
          <text className="axis-text" x={L - 5} y={bot.t + 8} textAnchor="end">thr</text>
          {gB && <path d={line(gB.throttle, yPct)} fill="none" stroke={B_COLOR} strokeWidth="1" opacity="0.6" vectorEffect="non-scaling-stroke" />}
          <path d={line(gA.throttle, yPct)} fill="none" stroke={A_COLOR} strokeWidth="1.3" opacity="0.9" vectorEffect="non-scaling-stroke" />
          {gA.brake.map((v, i) => (v > 0 ? (
            <rect key={i} x={x(i)} y={bot.t + bot.h + 4} width={Math.max(1, (W - L - R) / n)} height={8}
                  fill="#e0384a" opacity="0.85" />
          ) : null))}
          {gB && gB.brake.map((v, i) => (v > 0 ? (
            <rect key={`b${i}`} x={x(i)} y={bot.t + bot.h + 13} width={Math.max(1, (W - L - R) / n)} height={5}
                  fill={B_COLOR} opacity="0.7" />
          ) : null))}
        </svg>
      </div>
    </div>
  )
}

/* ---- cumulative delta + per-corner attribution --------------------------- */

function DeltaBars({ curve, cDeltas, dataA, dataB, rowOf, a, b }) {
  const W = 1000, H = 190, L = 44, R = 10, T = 12, B = 18

  if (!curve) {
    return (
      <div className="panel">
        <div className="panel-head"><span className="label">Delta</span></div>
        <div className="hint">Pick a second driver to see the time delta.</div>
      </div>
    )
  }

  const vals = curve.map((p) => p.delta)
  const m = Math.max(0.15, Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals))) * 1.15)
  const x = (i) => L + (i / (curve.length - 1)) * (W - L - R)
  // Positive delta means the second driver is LOSING time, and losing time
  // reads as "falling away", so positive runs downward.
  const y = (v) => T + ((v + m) / (2 * m)) * (H - T - B)

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">
          Cumulative delta — <span style={{ color: B_COLOR }}>{rowOf(b)?.tla}</span> relative to{' '}
          <span style={{ color: A_COLOR }}>{rowOf(a)?.tla}</span>
        </span>
        <span className="label">
          final {delta(curve[curve.length - 1].delta)}s
        </span>
      </div>
      <div className="panel-body" style={{ overflow: 'hidden' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {cDeltas.map((c) => {
            const x0 = x(c.start), x1 = x(c.end)
            const lost = c.delta > 0
            return (
              <g key={c.index}>
                <rect x={x0} y={T} width={Math.max(1, x1 - x0)} height={H - T - B}
                      fill={lost ? '#e0384a' : '#2fd35c'}
                      opacity={Math.min(0.22, Math.abs(c.delta) * 0.6 + 0.04)} />
                <text x={(x0 + x1) / 2} y={H - 5} textAnchor="middle"
                      className="axis-text"
                      fill={lost ? '#ff8b96' : '#7fe6a0'}>
                  {c.index}:{c.delta > 0 ? '+' : ''}{c.delta.toFixed(3)}
                </text>
              </g>
            )
          })}
          <line className="axis-line" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
          <text className="axis-text" x={L - 5} y={y(0) + 3} textAnchor="end">0</text>
          <text className="axis-text" x={L - 5} y={y(-m * 0.7) + 3} textAnchor="end">-{(m * 0.7).toFixed(2)}</text>
          <text className="axis-text" x={L - 5} y={y(m * 0.7) + 3} textAnchor="end">+{(m * 0.7).toFixed(2)}</text>
          <text className="axis-text" x={L + 4} y={y(-m) + 10} fill="#7fe6a0">ahead</text>
          <text className="axis-text" x={L + 4} y={y(m) - 4} fill="#ff8b96">behind</text>
          <path
            d={curve.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.delta).toFixed(1)}`).join(' ')}
            fill="none" stroke="#d8dee8" strokeWidth="1.8" vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  )
}
