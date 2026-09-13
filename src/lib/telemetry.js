// ---------------------------------------------------------------------------
// Lap telemetry analysis.
//
// Distance is integrated from the speed channel rather than taken from GPS.
// Speed is sampled far more densely and cleanly than /location, and delta-time
// analysis only needs a consistent distance axis shared by both laps -- which
// integration gives you, while GPS dropouts would not.
// ---------------------------------------------------------------------------

/** Raw car_data rows -> channel arrays with an integrated distance axis. */
export function buildTrace(rows) {
  const src = rows
    .filter((r) => r.speed != null)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  if (src.length < 5) return null

  const t0 = new Date(src[0].date).getTime()
  const t = [], speed = [], throttle = [], brake = [], gear = [], rpm = [], drs = []
  const dist = []
  let d = 0

  for (let i = 0; i < src.length; i++) {
    const r = src[i]
    const ti = (new Date(r.date).getTime() - t0) / 1000
    if (i > 0) {
      const dt = ti - t[i - 1]
      const vAvg = ((speed[i - 1] + r.speed) / 2) / 3.6   // km/h -> m/s
      d += Math.max(0, vAvg * Math.min(dt, 1.5))
    }
    t.push(ti)
    dist.push(d)
    speed.push(r.speed)
    throttle.push(r.throttle ?? 0)
    brake.push(r.brake ?? 0)
    gear.push(r.n_gear ?? 0)
    rpm.push(r.rpm ?? 0)
    drs.push(r.drs ?? 0)
  }
  return { t, dist, speed, throttle, brake, gear, rpm, drs, length: d, t0 }
}

const interp = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  let lo = 0, hi = xs.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid; else hi = mid
  }
  const span = xs[hi] - xs[lo]
  const f = span === 0 ? 0 : (x - xs[lo]) / span
  return ys[lo] + (ys[hi] - ys[lo]) * f
}

/** Resample every channel onto a uniform distance grid. */
export function onGrid(trace, steps = 600) {
  if (!trace) return null
  const L = trace.length
  const grid = Array.from({ length: steps }, (_, i) => (i / (steps - 1)) * L)
  const pick = (arr) => grid.map((x) => interp(trace.dist, arr, x))
  return {
    dist: grid,
    length: L,
    t: pick(trace.t),
    speed: pick(trace.speed),
    throttle: pick(trace.throttle),
    brake: pick(trace.brake),
    gear: grid.map((x) => Math.round(interp(trace.dist, trace.gear, x))),
    rpm: pick(trace.rpm),
  }
}

/**
 * Cumulative time delta between two laps on a shared *normalised* distance
 * axis. Lap lengths differ slightly (integration drift, different lines), so
 * both are normalised to 0..1 of their own lap before comparison.
 */
export function deltaCurve(gridA, gridB, steps = 600) {
  if (!gridA || !gridB) return null
  const out = []
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1)
    const tA = interp(gridA.dist, gridA.t, f * gridA.length)
    const tB = interp(gridB.dist, gridB.t, f * gridB.length)
    out.push({ f, dist: f * gridA.length, delta: tB - tA })
  }
  return out
}

/**
 * Corner detection: significant local speed minima, each expanded to the
 * braking point and the following exit. Good enough to attribute lap time
 * to individual corners without a circuit definition file.
 */
export function findCorners(grid) {
  if (!grid) return []
  const v = grid.speed
  const n = v.length
  const vMax = Math.max(...v)
  const threshold = vMax * 0.82

  const minima = []
  const win = Math.max(3, Math.round(n * 0.012))
  for (let i = win; i < n - win; i++) {
    if (v[i] > threshold) continue
    let isMin = true
    for (let k = i - win; k <= i + win; k++) if (v[k] < v[i] - 0.01) { isMin = false; break }
    if (isMin) minima.push(i)
  }

  // Merge minima that sit inside the same braking event.
  const merged = []
  const gapMin = Math.round(n * 0.02)
  for (const i of minima) {
    if (merged.length && i - merged[merged.length - 1].apex < gapMin) {
      if (v[i] < v[merged[merged.length - 1].apex]) merged[merged.length - 1].apex = i
    } else merged.push({ apex: i })
  }

  return merged.map((c, idx) => {
    let s = c.apex
    while (s > 0 && v[s - 1] > v[s]) s--             // walk back up the braking ramp
    let e = c.apex
    while (e < n - 1 && v[e + 1] > v[e]) e++         // walk forward up the exit
    return {
      index: idx + 1,
      start: s,
      apex: c.apex,
      end: Math.min(e, n - 1),
      minSpeed: Math.round(v[c.apex]),
    }
  })
}

/** Per-corner time gained/lost, read off the cumulative delta curve. */
export function cornerDeltas(corners, curve) {
  if (!curve) return []
  return corners.map((c) => ({
    ...c,
    delta: curve[c.end].delta - curve[c.start].delta,
  }))
}

/** Match location samples to the lap window and tag each with a speed. */
export function speedPath(locRows, trace) {
  if (!trace || !locRows?.length) return []
  const t0 = trace.t0
  return locRows
    .filter((r) => r.x != null)
    .map((r) => {
      const ti = (new Date(r.date).getTime() - t0) / 1000
      return { x: r.x, y: r.y, t: ti, speed: interp(trace.t, trace.speed, ti) }
    })
    .filter((p) => p.t >= -0.5 && p.t <= trace.t[trace.t.length - 1] + 0.5)
}

/** Blue -> green -> yellow -> red ramp over a speed range. */
export function speedColor(v, min, max) {
  const f = Math.max(0, Math.min(1, (v - min) / Math.max(1, max - min)))
  const stops = [
    [0.00, [45, 90, 190]],
    [0.35, [40, 170, 160]],
    [0.62, [120, 200, 70]],
    [0.82, [235, 190, 50]],
    [1.00, [230, 70, 70]],
  ]
  for (let i = 1; i < stops.length; i++) {
    if (f <= stops[i][0]) {
      const [f0, c0] = stops[i - 1], [f1, c1] = stops[i]
      const k = (f - f0) / (f1 - f0)
      const c = c0.map((x, j) => Math.round(x + (c1[j] - x) * k))
      return `rgb(${c[0]},${c[1]},${c[2]})`
    }
  }
  return 'rgb(230,70,70)'
}
