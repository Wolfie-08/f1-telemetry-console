import React, { useEffect, useMemo, useState } from 'react'
import { useRaceFeed, useSessionCatalog } from './state/useRaceFeed.js'
import { towerRows, leaderLap, trackStatus } from './lib/derive.js'
import Header from './components/Header.jsx'
import StatusBar from './components/StatusBar.jsx'
import TimingTower from './components/TimingTower.jsx'
import TrackMap from './components/TrackMap.jsx'
import RaceControlFeed from './components/RaceControlFeed.jsx'
import StintBars from './components/StintBars.jsx'
import GapChart from './components/GapChart.jsx'
import ComparePanel from './components/ComparePanel.jsx'

const YEAR = new Date().getUTCFullYear()

export default function App() {
  const catalog = useSessionCatalog(YEAR)
  const [sessionKey, setSessionKey] = useState(null)
  const [pinned, setPinned] = useState(false)   // user picked a session by hand
  const [tab, setTab] = useState('race')
  const [selected, setSelected] = useState([])
  const [clock, setClock] = useState(() => new Date().toISOString())

  // Follow whatever is running now, else the most recent session. This keeps
  // running: open the page before lights out on qualifying data and it hops to
  // the race by itself the moment the race session goes live. A manual pick
  // from the dropdown pins the choice and stops the following.
  useEffect(() => {
    if (pinned) return
    const pick = catalog.live || catalog.latest
    if (pick && pick.session_key !== sessionKey) setSessionKey(pick.session_key)
  }, [catalog.live, catalog.latest, pinned, sessionKey])

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toISOString()), 1000)
    return () => clearInterval(id)
  }, [])

  const { data, phase, error, tick, apiStats } = useRaceFeed(sessionKey)

  const rows = useMemo(() => towerRows(data), [data, tick, phase])
  const lap = useMemo(() => leaderLap(data), [data, tick])
  const status = useMemo(() => trackStatus(data), [data, tick])

  const live = useMemo(() => {
    if (!data.session) return false
    const now = Date.now()
    return now >= new Date(data.session.date_start).getTime() - 10 * 60_000
        && now <= new Date(data.session.date_end).getTime() + 20 * 60_000
  }, [data.session, clock])

  const toggle = (n) =>
    setSelected((cur) =>
      cur.includes(n) ? cur.filter((x) => x !== n)
      : cur.length < 2 ? [...cur, n]
      : [cur[1], n])

  // Newest first, and never truncated -- a cut-off list silently desynchronises
  // the <select> from the session actually loaded.
  const sessionList = useMemo(
    () => [...catalog.list].sort((a, b) => new Date(b.date_start) - new Date(a.date_start)),
    [catalog.list],
  )

  const pickSession = (key) => { setPinned(true); setSessionKey(key) }

  return (
    <div className="app">
      <Header
        store={data} status={status} lap={lap} live={live}
        tab={tab} setTab={setTab}
        sessions={sessionList} sessionKey={sessionKey} setSessionKey={pickSession}
        clock={clock}
      />

      {tab === 'race' ? (
        <div className="main grid-race">
          <TimingTower rows={rows} selected={selected} onSelect={toggle} />
          <TrackMap store={data} rows={rows} selected={selected} live={live} />
          <GapChart store={data} rows={rows} selected={selected} tick={tick}
                    isRace={data.session?.session_type === 'Race'} />
          <RaceControlFeed messages={data.rc} gmt={data.gmt || 0} />
          <StintBars store={data} rows={rows} maxLap={lap} />
        </div>
      ) : (
        <div className="main grid-compare">
          <ComparePanel
            store={data} rows={rows} sessionKey={sessionKey}
            selected={selected} setSelected={setSelected}
          />
        </div>
      )}

      <StatusBar stats={apiStats} store={data} phase={phase} error={error || catalog.error} live={live} />
    </div>
  )
}
