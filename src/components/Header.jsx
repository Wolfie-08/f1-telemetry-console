import React from 'react'
import { lapTime, clockAt } from '../lib/format.js'

const STATUS = {
  CLEAR:      { bg: '#14361f', fg: '#7fe6a0', text: 'TRACK CLEAR' },
  GREEN:      { bg: '#14361f', fg: '#7fe6a0', text: 'GREEN' },
  YELLOW:     { bg: '#3a3210', fg: '#e8ce5c', text: 'YELLOW' },
  DOUBLE_YELLOW: { bg: '#3a3210', fg: '#e8ce5c', text: 'DOUBLE YELLOW' },
  SC:         { bg: '#3a3210', fg: '#ffd84d', text: 'SAFETY CAR' },
  SC_ENDING:  { bg: '#3a3210', fg: '#ffd84d', text: 'SC IN THIS LAP' },
  VSC:        { bg: '#3a3210', fg: '#ffd84d', text: 'VIRTUAL SC' },
  VSC_ENDING: { bg: '#3a3210', fg: '#ffd84d', text: 'VSC ENDING' },
  RED:        { bg: '#3d1116', fg: '#ff8b96', text: 'RED FLAG' },
  CHEQUERED:  { bg: '#2a2a2a', fg: '#e8e8e8', text: 'CHEQUERED' },
}

function Metric({ label, value, color }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="v" style={color ? { color } : undefined}>{value}</span>
    </div>
  )
}

export default function Header({
  store, status, lap, live, tab, setTab,
  sessions, sessionKey, setSessionKey, clock,
}) {
  const st = STATUS[status] || STATUS.CLEAR
  const sb = store.sessionBestLap
  const sbDrv = sb ? (store.drivers[sb.driver]?.name_acronym ?? sb.driver) : null
  const w = store.weather
  const gmt = store.gmt || 0
  const isRace = store.session?.session_type === 'Race'

  return (
    <div className="topbar">
      <div className="brand">
        <b>TELEMETRY</b><span>console</span>
      </div>

      <div className="meta">
        <Metric
          label={store.meeting?.country_name || 'Session'}
          value={`${store.session?.circuit_short_name || '—'} · ${store.session?.session_name || '—'}`}
        />

        <span className="pill" style={{ background: st.bg, color: st.fg }}>
          <i className={`dot ${status !== 'CLEAR' && status !== 'GREEN' ? 'blink' : ''}`} />
          {st.text}
        </span>

        {isRace && <Metric label="Lap" value={lap ? `${lap}` : '--'} />}
        <Metric label="Fastest" value={sb ? `${lapTime(sb.time)}` : '--:--.---'} color="var(--purple)" />
        {sbDrv && <Metric label="By" value={sbDrv} />}

        {w && (
          <>
            <Metric label="Air" value={`${w.air_temperature?.toFixed(1)}°`} />
            <Metric label="Track" value={`${w.track_temperature?.toFixed(1)}°`}
                    color={w.track_temperature > 45 ? 'var(--yellow)' : undefined} />
            <Metric label="Wind" value={`${w.wind_speed?.toFixed(1)} m/s`} />
            <Metric label="Rain" value={w.rainfall ? 'YES' : 'NO'}
                    color={w.rainfall ? 'var(--blue)' : undefined} />
          </>
        )}

        <Metric label="Circuit time" value={clockAt(clock, gmt)} />
      </div>

      <span className="pill" style={{
        background: live ? '#3d1116' : '#1a1f27',
        color: live ? '#ff7b88' : 'var(--dim)',
      }}>
        <i className={`dot ${live ? 'blink' : ''}`} />{live ? 'LIVE' : 'REPLAY'}
      </span>

      <select value={sessionKey || ''} onChange={(e) => setSessionKey(Number(e.target.value))}>
        {sessions.map((s) => (
          <option key={s.session_key} value={s.session_key}>
            {s.circuit_short_name} — {s.session_name}
          </option>
        ))}
      </select>

      <div className="tabs">
        <button className={tab === 'race' ? 'on' : ''} onClick={() => setTab('race')}>RACE</button>
        <button className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>COMPARE</button>
      </div>
    </div>
  )
}
