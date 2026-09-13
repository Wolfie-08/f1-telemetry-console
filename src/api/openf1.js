// ---------------------------------------------------------------------------
// OpenF1 client.
//
// Two things about this API shape the whole design.
//
// 1. RATE LIMITS ARE PER-MINUTE AS WELL AS PER-SECOND.
//    Community (anonymous): 3 req/s AND 30 req/min.
//    Sponsor  (authorised): 6 req/s AND 60 req/min.
//    The per-minute cap is the binding one: 30/min is one request every two
//    seconds, nowhere near 3/s. Everything funnels through one global FIFO
//    queue paced off the per-minute budget.
//
// 2. THE API CLOSES DURING LIVE SESSIONS.
//    While any F1 session is running, anonymous requests get 401 on every
//    endpoint -- including historical data. The 401 carries no CORS header,
//    so a browser cannot read the status: fetch just throws an opaque
//    TypeError. That is indistinguishable from being offline, so the client
//    reports what it saw and lets the app decide (see state/useSeason.js,
//    which knows from the cached calendar whether a session is live).
// ---------------------------------------------------------------------------

const BASE = 'https://api.openf1.org/v1/'
const TOKEN_URL = 'https://api.openf1.org/token'

const LIMITS = {
  anonymous: { perMinute: 30, perSecond: 3, label: 'community' },
  authorised: { perMinute: 60, perSecond: 6, label: 'sponsor' },
}

/** Keep a 15% margin under the published cap. */
const gapFor = (limit) =>
  Math.ceil(Math.max(60_000 / limit.perMinute, 1000 / limit.perSecond) * 1.15)

const MAX_RETRIES = 3
const REQUEST_TIMEOUT_MS = 20_000

/* -- auth ------------------------------------------------------------------
 * Credentials belong to the person running this, never to the code: they are
 * read from browser storage and used only to mint a token. Nothing is ever
 * sent anywhere except OpenF1's own token endpoint.
 * ------------------------------------------------------------------------ */

const CRED_KEY = 'f1console.openf1.credentials'
const TOKEN_KEY = 'f1console.openf1.token'

let token = null            // { value, expiresAt }
let tokenPromise = null

const safeGet = (store, key) => {
  try { return JSON.parse(store.getItem(key) || 'null') } catch { return null }
}
const safeSet = (store, key, value) => {
  try {
    if (value == null) store.removeItem(key)
    else store.setItem(key, JSON.stringify(value))
  } catch { /* private mode */ }
}

/** Restore a still-valid token from a previous page load. */
;(function restore() {
  const saved = safeGet(sessionStorage, TOKEN_KEY)
  if (saved?.value && saved.expiresAt > Date.now() + 30_000) token = saved
})()

export const auth = {
  /** A token the user pasted in, or one minted from stored credentials. */
  setToken(value, ttlSeconds = 3600) {
    token = value ? { value, expiresAt: Date.now() + ttlSeconds * 1000 } : null
    safeSet(sessionStorage, TOKEN_KEY, token)
  },
  /** Stored so the client can re-mint a token when the hourly one expires. */
  setCredentials(username, password) {
    safeSet(localStorage, CRED_KEY, username ? { username, password } : null)
    token = null
    safeSet(sessionStorage, TOKEN_KEY, null)
  },
  hasCredentials: () => Boolean(safeGet(localStorage, CRED_KEY)?.username),
  username: () => safeGet(localStorage, CRED_KEY)?.username || null,
  hasToken: () => Boolean(token?.value && token.expiresAt > Date.now()),
  clear() {
    token = null
    safeSet(sessionStorage, TOKEN_KEY, null)
    safeSet(localStorage, CRED_KEY, null)
  },
}

async function mintToken() {
  const cred = safeGet(localStorage, CRED_KEY)
  if (!cred?.username || !cred?.password) return null
  const body = new URLSearchParams()
  body.append('username', cred.username)
  body.append('password', cred.password)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`token ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('token response had no access_token')
  auth.setToken(data.access_token, Number(data.expires_in) || 3600)
  return token.value
}

/** A valid bearer token, minting or refreshing one if we can. */
async function currentToken() {
  if (token?.value && token.expiresAt > Date.now() + 60_000) return token.value
  if (!auth.hasCredentials()) return token?.value || null
  if (!tokenPromise) {
    tokenPromise = mintToken()
      .catch((e) => { stats.authError = String(e.message || e); return null })
      .finally(() => { tokenPromise = null })
  }
  return tokenPromise
}

/* -- queue ----------------------------------------------------------------- */

const queue = []
let draining = false
let lastSentAt = 0

const inflight = new Map()   // url -> Promise (dedupe)
const statics = new Map()    // url -> resolved value (never re-fetched)

export const stats = {
  sent: 0, failed: 0, throttled: 0, queued: 0,
  lastError: null, lastOkAt: null, authError: null,
  /** 'ok' | 'blocked' | 'offline' — what the last failure looked like. */
  lastFailKind: null,
  tier: LIMITS.anonymous.label,
  minGapMs: gapFor(LIMITS.anonymous),
}

function retune() {
  const limit = (auth.hasToken() || auth.hasCredentials())
    ? LIMITS.authorised : LIMITS.anonymous
  stats.tier = limit.label
  stats.minGapMs = gapFor(limit)
}
retune()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function drain() {
  if (draining) return
  draining = true
  while (queue.length) {
    stats.queued = queue.length
    const wait = stats.minGapMs - (Date.now() - lastSentAt)
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
        // A hung connection must not stall the whole console forever, which
        // is what happened before this timeout existed: the queue sat with
        // zero sent, zero failed, and nothing on screen.
        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)
        try {
          const bearer = await currentToken()
          const res = await fetch(url, {
            signal: abort.signal,
            headers: {
              accept: 'application/json',
              ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
            },
          })
          clearTimeout(timer)

          if (res.status === 401 || res.status === 403) {
            stats.lastFailKind = 'blocked'
            stats.lastError = `HTTP ${res.status} — not authorised`
            stats.failed += 1
            reject(new Error(`HTTP ${res.status}`))
            return
          }
          if (res.status === 429 || res.status >= 500) {
            stats.throttled += res.status === 429 ? 1 : 0
            if (job.attempt <= MAX_RETRIES) {
              await sleep(1500 * job.attempt)
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
          stats.lastFailKind = 'ok'
          resolve(Array.isArray(json) ? json : [])
        } catch (err) {
          clearTimeout(timer)
          // A cross-origin 401 with no CORS header reaches us as a bare
          // TypeError, identical to being offline. Record it as such; the
          // caller has the calendar and can tell the two apart.
          const opaque = err?.name === 'TypeError' || err?.name === 'AbortError'
          if (opaque) stats.lastFailKind = 'offline'
          if (job.attempt <= MAX_RETRIES) {
            await sleep(1200 * job.attempt)
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

/** Re-pace the queue after the user adds or removes credentials. */
export function refreshTier() { retune() }

export const sessions      = (p) => get('sessions', p, { static: true })
export const meetings       = (p) => get('meetings', p, { static: true })
export const drivers        = (p) => get('drivers', p, { static: true })
export const laps           = (p) => get('laps', p)
export const intervals      = (p) => get('intervals', p)
export const positions      = (p) => get('position', p)
export const stints         = (p) => get('stints', p)
export const pit            = (p) => get('pit', p)
export const raceControl    = (p) => get('race_control', p)
export const weather        = (p) => get('weather', p)
export const carData        = (p) => get('car_data', p)
export const location       = (p) => get('location', p)
export const sessionResult  = (p) => get('session_result', p)
export const startingGrid   = (p) => get('starting_grid', p)
export const overtakes      = (p) => get('overtakes', p)
// Official championship tables — one request each, rather than summing
// every round's classification by hand.
export const championshipDrivers = (p) => get('championship_drivers', p)
export const championshipTeams   = (p) => get('championship_teams', p)
