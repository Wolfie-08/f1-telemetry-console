import React from 'react'
import { SEASONS, } from '../state/useSeason.js'
import { SPEEDS } from '../state/useReplay.js'
import { clockAt, elapsed } from '../lib/format.js'
import { replayProgress, sessionSpan } from '../lib/replay.js'

/**
 * Season -> round -> session navigation, plus the replay transport for any
 * session that has already finished.
 */
export default function SessionBar({
  mode, setMode,
  year, setYear, rounds, roundKey, setRoundKey, sessionKey, setSessionKey,
  session, isPast, replay, liveSession,
}) {
  const round = rounds.find((r) => r.meetingKey === roundKey)
  const gmt = 0

  return (
    <div className="subbar">
      <div className="seg">
        <button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>
          LIVE
        </button>
        <button className={mode === 'browse' ? 'on' : ''} onClick={() => setMode('browse')}>
          ARCHIVE
        </button>
      </div>

      {mode === 'browse' && (
        <>
          <label className="label">Season</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {SEASONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <label className="label">Round</label>
          <select value={roundKey || ''} onChange={(e) => setRoundKey(Number(e.target.value))}>
            {rounds.map((r) => (
              <option key={r.meetingKey} value={r.meetingKey}>
                R{r.round} · {r.location} ({r.circuit})
              </option>
            ))}
          </select>

          <label className="label">Session</label>
          <select value={sessionKey || ''} onChange={(e) => setSessionKey(Number(e.target.value))}>
            {(round?.sessions || []).map((s) => (
              <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
            ))}
          </select>
        </>
      )}

      {mode === 'live' && liveSession && (
        <span className="label" style={{ color: 'var(--green)' }}>
          following {liveSession.circuit_short_name} · {liveSession.session_name}
        </span>
      )}

      {isPast && replay?.vt != null && session && (
        <>
          <div className="seg" style={{ marginLeft: 'auto' }}>
            <button onClick={() => replay.nudge(-60)} title="back 1 min">-1m</button>
            <button onClick={() => replay.setPlaying(!replay.playing)}
                    className={replay.playing ? 'on' : ''}
                    style={{ minWidth: 34 }}>
              {replay.playing ? '❚❚' : '▶'}
            </button>
            <button onClick={() => replay.nudge(60)} title="forward 1 min">+1m</button>
          </div>

          <select value={replay.speed} onChange={(e) => replay.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>

          <input
            className="scrub"
            type="range" min="0" max="1000"
            value={Math.round(replayProgress(session, replay.vt) * 1000)}
            onChange={(e) => replay.seek(Number(e.target.value) / 1000)}
          />

          <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', minWidth: 96 }}>
            {clockAt(new Date(replay.vt).toISOString(), session ? 0 : 0)}
            {'  '}
            <span style={{ color: 'var(--dim)' }}>
              +{elapsed((replay.vt - sessionSpan(session).start) / 1000)}
            </span>
          </span>
        </>
      )}
    </div>
  )
}
