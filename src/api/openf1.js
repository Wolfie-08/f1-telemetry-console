// ---------------------------------------------------------------------------
// OpenF1 client.
//
// The public API allows 3 requests/second and answers 429 the moment you go
// over. Everything therefore funnels through one global FIFO queue that paces
// itself, retries 429/5xx with backoff, and de-duplicates identical in-flight
// requests. Nothing in the app calls fetch() directly.
// ---------------------------------------------------------------------------

const BASE = 'https://api.openf1.org/v1/'

const MIN_GAP_MS = 380      // ~2.6 req/s, a deliberate margin under the cap
const MAX_RETRIES = 4

const queue = []
let draining = false
let lastSentAt = 0

const inflight = new Map()   // url -> Promise (dedupe)
const statics = new Map()    // url -> resolved value (never re-fetched)

/** Observable counters, surfaced in the status bar. */
export const stats = {
  sent: 0, failed: 0, throttled: 0, queued: 0,
  lastError: null, lastOkAt: null,
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function drain() {
  if (draining) return
  draining = true
  while (queue.length) {
    stats.queued = queue.length
    const wait = MIN_GAP_MS - (Date.now() - lastSentAt)
    if (wait > 0) await sleep(wait)
    const job = queue.shift()
    lastSentAt = Date.now()
    job.run()
  }
  stats.queued = 0
  draining = false
}

function enqueue(url) {
  return new Promise((resolve, reject) => {
    const job = {
      attempt: 0,
      run: async () => {
        job.attempt += 1
        try {
          const res = await fetch(url, { headers: { accept: 'application/json' } })
          if (res.status === 429 || res.status >= 500) {
            stats.throttled += res.status === 429 ? 1 : 0
            if (job.attempt <= MAX_RETRIES) {
              // Exponential-ish backoff, then re-queue at the front.
              await sleep(500 * job.attempt)
              queue.unshift(job)
              drain()
              return
            }
            throw new Error(`HTTP ${res.status}`)
          }
          if (res.status === 404) { resolve([]); stats.sent += 1; return }
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = await res.json()
          stats.sent += 1
          stats.lastOkAt = Date.now()
          resolve(Array.isArray(json) ? json : [])
        } catch (err) {
          if (job.attempt <= MAX_RETRIES) {
            await sleep(600 * job.attempt)
            queue.unshift(job)
            drain()
            return
          }
          stats.failed += 1
          stats.lastError = String(err.message || err)
          reject(err)
        }
      },
    }
    queue.push(job)
    drain()
  })
}

function buildUrl(resource, params = {}) {
  // OpenF1 uses bare comparison operators in the query string
  // (e.g. `date>2026-09-13T13:00:00`), so the query is assembled by hand
  // rather than with URLSearchParams, which would escape the operator.
  const parts = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return BASE + resource + (parts.length ? '?' + parts.join('&') : '')
}

/**
 * Fetch a resource.
 * @param {string} resource  e.g. 'laps'
 * @param {object} params    query params; keys may carry an operator: { 'date>': iso }
 * @param {object} opts      { static: true } caches forever
 */
export function get(resource, params = {}, opts = {}) {
  const url = buildUrl(resource, params)
  if (opts.static && statics.has(url)) return Promise.resolve(statics.get(url))
  if (inflight.has(url)) return inflight.get(url)

  const p = enqueue(url)
    .then((data) => {
      if (opts.static) statics.set(url, data)
      return data
    })
    .finally(() => inflight.delete(url))

  inflight.set(url, p)
  return p
}

export const sessions      = (p) => get('sessions', p, { static: true })
export const meetings      = (p) => get('meetings', p, { static: true })
export const drivers       = (p) => get('drivers', p, { static: true })
export const laps          = (p) => get('laps', p)
export const intervals     = (p) => get('intervals', p)
export const positions     = (p) => get('position', p)
export const stints        = (p) => get('stints', p)
export const pit           = (p) => get('pit', p)
export const raceControl   = (p) => get('race_control', p)
export const weather       = (p) => get('weather', p)
export const carData       = (p) => get('car_data', p)
export const location      = (p) => get('location', p)
export const sessionResult = (p) => get('session_result', p)
