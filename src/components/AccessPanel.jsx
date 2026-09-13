import React, { useEffect, useState } from 'react'
import * as api from '../api/openf1.js'

const pad = (n) => String(Math.floor(n)).padStart(2, '0')

/**
 * Shown when the API is shut. OpenF1 answers 401 on every endpoint -- live
 * and historical alike -- while an F1 session is running, unless the caller
 * is an authorised sponsor. This explains that, counts down to when access
 * returns, and offers to hold a key.
 */
export default function AccessPanel({ blackout, onRetry }) {
  const [, tick] = useState(0)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const sess = blackout.session
  const left = blackout.opensAt ? Math.max(0, blackout.opensAt - Date.now()) : null
  const h = left == null ? 0 : (left % 86400000) / 3600000
  const m = left == null ? 0 : (left % 3600000) / 60000
  const s = left == null ? 0 : (left % 60000) / 1000

  return (
    <div className="panel idle" style={{ gridColumn: '1 / -1' }}>
      <div className="panel-head">
        <span className="label">
          {sess ? 'API closed — session in progress' : 'Cannot reach OpenF1'}
        </span>
        <span className="label">{api.stats.tier} tier</span>
      </div>

      <div className="idle-body">
        <div className="idle-next">
          {sess ? (
            <>
              <span className="label">Running now</span>
              <h1>{sess.location}</h1>
              <h2>{sess.circuit_short_name} · {sess.session_name}</h2>
            </>
          ) : (
            <>
              <span className="label">No data</span>
              <h1>OpenF1 unreachable</h1>
              <h2>most likely a live session</h2>
            </>
          )}
        </div>

        <p style={{
          maxWidth: 620, textAlign: 'center', margin: 0,
          color: 'var(--text-2)', fontSize: 12.5, lineHeight: 1.65,
        }}>
          OpenF1 restricts <b>all</b> API access — live timing and historical
          data alike — to authorised callers while a session is running.
          Anonymous requests get <span className="mono">401</span>, and because
          that response carries no CORS header a browser can only see an opaque
          network failure. Nothing here is broken; the data comes back on its own.
          {!sess && ' This browser has no cached calendar yet, so the session ' +
                    'cannot be named until access returns — the other possibility ' +
                    'is simply that you are offline.'}
        </p>

        {sess && (
          <>
            <div className="idle-clock mono">
              <span><b>{pad(h)}</b><i>hrs</i></span>
              <span><b>{pad(m)}</b><i>min</i></span>
              <span><b>{pad(s)}</b><i>sec</i></span>
            </div>
            <span className="label">until the session ends and access returns</span>
          </>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRetry} style={{ padding: '8px 14px', fontSize: 12 }}>
            Try again now
          </button>
          <button onClick={() => setOpen((v) => !v)} style={{ padding: '8px 14px', fontSize: 12 }}>
            {open ? 'Hide access settings' : 'I have a sponsor account →'}
          </button>
        </div>

        {open && <Credentials />}
      </div>
    </div>
  )
}

/**
 * Holds an OpenF1 sponsor login so live sessions work. The token endpoint
 * takes a username and password and returns a bearer token that expires
 * hourly, so storing the login is what allows the console to keep itself
 * authorised across a two-hour race. Everything stays in this browser and is
 * only ever sent to OpenF1's own token endpoint.
 */
function Credentials() {
  const [mode, setMode] = useState(api.auth.hasCredentials() ? 'login' : 'login')
  const [username, setUsername] = useState(api.auth.username() || '')
  const [password, setPassword] = useState('')
  const [pasted, setPasted] = useState('')
  const [saved, setSaved] = useState(api.auth.hasCredentials() || api.auth.hasToken())

  const save = () => {
    if (mode === 'login') api.auth.setCredentials(username.trim(), password)
    else api.auth.setToken(pasted.trim())
    api.refreshTier()
    setPassword(''); setPasted(''); setSaved(true)
  }
  const clear = () => {
    api.auth.clear(); api.refreshTier()
    setUsername(''); setPassword(''); setPasted(''); setSaved(false)
  }

  return (
    <div className="access" >
      <div className="seg" style={{ alignSelf: 'center' }}>
        <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
          SPONSOR LOGIN
        </button>
        <button className={mode === 'token' ? 'on' : ''} onClick={() => setMode('token')}>
          PASTE A TOKEN
        </button>
      </div>

      {mode === 'login' ? (
        <>
          <label className="label">OpenF1 username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)}
                 autoComplete="username" spellCheck="false" />
          <label className="label">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 autoComplete="current-password" />
          <p className="access-note">
            Kept in this browser's local storage and sent only to
            <span className="mono"> api.openf1.org/token</span>, which returns a
            bearer token valid for an hour. The console re-mints it as needed so
            a long session does not drop out mid-race.
          </p>
        </>
      ) : (
        <>
          <label className="label">Bearer token</label>
          <input value={pasted} onChange={(e) => setPasted(e.target.value)}
                 spellCheck="false" placeholder="access_token from /token" />
          <p className="access-note">
            Held in this tab only and never written to disk, so nothing of yours
            is stored — but OpenF1 tokens expire after an hour, so a full race
            will outlast one.
          </p>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={save} className="on" style={{ padding: '6px 14px' }}>Save</button>
        {saved && <button onClick={clear} style={{ padding: '6px 14px' }}>Forget</button>}
      </div>

      {api.stats.authError && (
        <p className="access-note" style={{ color: 'var(--red)' }}>{api.stats.authError}</p>
      )}

      <p className="access-note">
        No account? Live access is OpenF1's sponsor tier,{' '}
        <a href="https://openf1.org/" target="_blank" rel="noreferrer">€9.90/month</a>.
        The free tier stays fully usable for every past session.
      </p>
    </div>
  )
}
