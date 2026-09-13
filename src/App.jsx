import React, { useEffect, useMemo, useState } from 'react'
import { useRaceFeed } from './state/useRaceFeed.js'
import { useSeason, useStandings } from './state/useSeason.js'
import { useReplay } from './state/useReplay.js'
import { projectStore } from './lib/replay.js'
import { towerRows, leaderLap, trackStatus } from './lib/derive.js'
import Header from './components/Header.jsx'
import SessionBar from './components/SessionBar.jsx'
import StatusBar from './components/StatusBar.jsx'
import TimingTower from './components/TimingTower.jsx'
import TrackMap from './components/TrackMap.jsx'
import RaceControlFeed from './components/RaceControlFeed.jsx'
import StintBars from './components/StintBars.jsx'
import GapChart from './components/GapChart.jsx'
import ComparePanel from './components/ComparePanel.jsx'
import Standings from './components/Standings.jsx'
import Countdown from './components/Countdown.jsx'

const THIS_YEAR = new Date().getUTCFullYear()

export default function App() {
  const [year, setYear] = useState(THIS_YEAR)
  const season = useSeason(year)

  const [mode, setMode] = useState('live')      // live | browse
  const [roundKey, setRoundKey] = useState(null)
  const [browseKey, setBrowseKey] = useState(null)
  const [tab, setTab] = useState('race')
  const [selected, setSelected] = useState([])
  const [clock, setClock] = useState(() => new Date().toISOString())

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toISOString()), 1000)
    return () => clearInterval(id)
  }, [])

  // --- which session is on screen ----------------------------------------
  const liveKey = season.liveSession?.session_key ?? null
  const sessionKey = mode === 'live' ? liveKey : browseKey

  // Archive defaults: the latest round, and its race.
  const rounds = season.rounds
  useEffect(() => {
    if (mode !== 'browse' || !rounds.length) return
    if (rounds.some((r) => r.meetingKey === roundKey)) return
    const now = Date.now()
    const past = rounds.filter((r) => new Date(r.start).getTime() <= now)
    setRoundKey((past[past.length - 1] || rounds[0]).meetingKey)
  }, [mode, rounds, roundKey])

  useEffect(() => {
    if (mode !== 'browse') return
    const round = rounds.find((r) => r.meetingKey === roundKey)
    if (!round) return
    if (round.sessions.some((s) => s.session_key === browseKey)) return
    const race = [...round.sessions].reverse().find((s) => s.session_type === 'Race')
    setBrowseKey((race || round.sessions[round.sessions.length - 1]).session_key)
  }, [mode, roundKey, rounds, browseKey])

  // --- the feed -----------------------------------------------------------
  const { data: full, phase, error, tick, apiStats } = useRaceFeed(sessionKey)

  const live = useMemo(() => {
    if (!full.session) return false
    const now = Date.now()
    return now >= new Date(full.session.date_start).getTime() - 10 * 60_000
        && now <= new Date(full.session.date_end).getTime() + 20 * 60_000
  }, [full.session, clock])

  const isPast = Boolean(full.session) && !live && phase === 'ready'
  const replay = useReplay(isPast ? full.session : null, phase === 'ready')
  const replaying = isPast && replay.vt != null

  // Replay is a pure projection of the already-loaded history onto a virtual
  // clock, so the whole panel tree below is unchanged by it.
  const data = useMemo(
    () => (replaying ? projectStore({ ...full, loc: replay.loc }, replay.vt) : full),
    [replaying, replay.vt, replay.loc, tick, phase],
  )

  const rows = useMemo(() => towerRows(data), [data, tick, phase])
  const lap = useMemo(() => leaderLap(data), [data, tick])
  const status = useMemo(() => trackStatus(data), [data, tick])

  const standings = useStandings(year, season.sessions, tab === 'standings')

  const toggle = (n) =>
    setSelected((cur) =>
      cur.includes(n) ? cur.filter((x) => x !== n)
      : cur.length < 2 ? [...cur, n]
      : [cur[1], n])

  const waitingForLive = mode === 'live' && !liveKey

  return (
    <div className="app">
      <Header
        store={data} status={status} lap={lap}
        live={live} replaying={replaying}
        tab={tab} setTab={setTab} clock={clock}
      />

      <SessionBar
        mode={mode} setMode={setMode}
        year={year} setYear={(y) => { setYear(y); setRoundKey(null); setBrowseKey(null) }}
        rounds={rounds} roundKey={roundKey} setRoundKey={setRoundKey}
        sessionKey={browseKey} setSessionKey={setBrowseKey}
        session={full.session} isPast={isPast} replay={replay}
        liveSession={season.liveSession}
      />

      {tab === 'standings' ? (
        <div className="main grid-one">
          <Standings standings={standings} year={year} />
        </div>
      ) : waitingForLive ? (
        <div className="main grid-one">
          <Countdown next={season.nextSession} onOpenArchive={() => setMode('browse')} />
        </div>
      ) : tab === 'race' ? (
        <div className="main grid-race">
          <TimingTower rows={rows} selected={selected} onSelect={toggle} />
          <TrackMap store={data} rows={rows} selected={selected} live={live || replaying} />
          <GapChart store={data} rows={rows} selected={selected} tick={tick}
                    isRace={data.session?.session_type === 'Race'} />
          <RaceControlFeed messages={data.rc} gmt={data.gmt || 0} />
          <StintBars store={data} rows={rows} maxLap={lap} />
        </div>
      ) : (
        <div className="main grid-compare">
          <ComparePanel
            store={full} rows={rows} sessionKey={sessionKey}
            selected={selected} setSelected={setSelected}
          />
        </div>
      )}

      <StatusBar stats={apiStats} store={data} phase={phase}
                 error={error || season.error} live={live} />
    </div>
  )
}
