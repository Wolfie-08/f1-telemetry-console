// ---------------------------------------------------------------------------
// Number / time formatting. Everything here is pure.
// ---------------------------------------------------------------------------

/** 91.824 -> "1:31.824" */
export function lapTime(s) {
  if (s == null || !isFinite(s)) return '--:--.---'
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return m > 0
    ? `${m}:${rest.toFixed(3).padStart(6, '0')}`
    : rest.toFixed(3)
}

/** Sector time, always plain seconds. */
export const sector = (s) => (s == null || !isFinite(s) ? '--.---' : s.toFixed(3))

/** Signed delta with explicit sign, e.g. "+0.321" / "-0.114". */
export function delta(s, digits = 3) {
  if (s == null || !isFinite(s)) return '--'
  const v = s.toFixed(digits)
  return s > 0 ? `+${v}` : v
}

/**
 * Gap column. OpenF1 sends a number of seconds for cars on the lead lap and
 * the literal string "+1 LAP" (or "+2 LAPS") once a car has been lapped, so
 * both shapes have to survive this function.
 */
export function gap(v) {
  if (v == null) return '--'
  if (typeof v === 'string') return v
  if (!isFinite(v)) return '--'
  return v === 0 ? 'LEADER' : `+${v.toFixed(3)}`
}

/** Interval to the car ahead. Blank for the leader, passthrough for "+1 LAP". */
export function interval(v, isLeader) {
  if (isLeader) return '--'
  if (v == null) return '--'
  if (typeof v === 'string') return v
  if (!isFinite(v)) return '--'
  return `+${v.toFixed(3)}`
}

export const int2 = (n) => (n == null ? '--' : String(Math.round(n)))

/** "2026-09-13T13:04:11.2Z" -> "13:04:11" in the circuit's local clock. */
export function clockAt(iso, gmtOffsetSeconds = 0) {
  if (!iso) return '--:--:--'
  const t = new Date(iso).getTime() + gmtOffsetSeconds * 1000
  return new Date(t).toISOString().slice(11, 19)
}

/** "02:00:00" -> 7200 */
export function offsetToSeconds(off) {
  if (!off) return 0
  const [h, m, s] = off.split(':').map(Number)
  return (h * 3600) + (m * 60) + (s || 0)
}

/** Seconds elapsed -> "1:23:45" */
export function elapsed(sec) {
  if (sec == null || sec < 0) return '--:--'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/** OpenF1 wants naive ISO (no trailing Z) in date> / date< filters. */
export const apiDate = (d) => new Date(d).toISOString().replace('Z', '')
