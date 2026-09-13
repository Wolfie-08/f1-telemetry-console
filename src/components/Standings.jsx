import React, { useState } from 'react'

/**
 * Drivers' and constructors' championships, summed from the points OpenF1
 * reports in each race's classification.
 */
export default function Standings({ standings, year }) {
  const [view, setView] = useState('drivers')
  const { status, drivers, teams, progress, total, error } = standings

  const leader = view === 'drivers' ? drivers[0] : teams[0]
  const maxPts = leader?.points || 1

  return (
    <div className="panel" style={{ gridColumn: '1 / -1' }}>
      <div className="panel-head">
        <span className="label">{year} World Championship</span>
        <div className="seg">
          <button className={view === 'drivers' ? 'on' : ''} onClick={() => setView('drivers')}>
            DRIVERS
          </button>
          <button className={view === 'teams' ? 'on' : ''} onClick={() => setView('teams')}>
            CONSTRUCTORS
          </button>
        </div>
        <span className="label">
          {status === 'loading' ? `reading round ${progress}/${total}…`
            : status === 'error' ? error
            : `after ${standings.rounds} scoring sessions`}
        </span>
      </div>

      <div className="panel-body scroll">
        {status === 'loading' && !drivers.length && (
          <div className="hint">
            Summing points across every race of the season. OpenF1 has no
            standings endpoint, so this reads each round's classification —
            one request per round, paced under the rate limit. It is cached
            after the first run.
          </div>
        )}

        {view === 'drivers' ? (
          <table className="tower standings">
            <thead>
              <tr>
                <th style={{ width: 3, padding: 0 }} />
                <th className="l">P</th>
                <th className="l">Driver</th>
                <th className="l">Team</th>
                <th>Wins</th>
                <th>Podiums</th>
                <th style={{ width: '32%' }} className="l">Points</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.num}>
                  <td className="teamstripe" style={{ background: d.color }} />
                  <td className="pos l">{d.pos}</td>
                  <td className="l">
                    <span className="drv">
                      <span className="num">{d.num}</span>
                      <span className="tla">{d.tla}</span>
                    </span>
                  </td>
                  <td className="l" style={{ color: 'var(--text-2)', fontSize: 11 }}>{d.team}</td>
                  <td className="mono">{d.wins || '–'}</td>
                  <td className="mono">{d.podiums || '–'}</td>
                  <td className="l">
                    <span className="ptbar">
                      <i style={{ width: `${(d.points / maxPts) * 100}%`, background: d.color }} />
                      <b>{d.points}</b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="tower standings">
            <thead>
              <tr>
                <th style={{ width: 3, padding: 0 }} />
                <th className="l">P</th>
                <th className="l">Constructor</th>
                <th className="l">Drivers</th>
                <th>Wins</th>
                <th style={{ width: '38%' }} className="l">Points</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.team}>
                  <td className="teamstripe" style={{ background: t.color }} />
                  <td className="pos l">{t.pos}</td>
                  <td className="l"><span className="tla">{t.team}</span></td>
                  <td className="l" style={{ color: 'var(--dim)', fontSize: 11 }}>
                    {t.drivers.join(' · ')}
                  </td>
                  <td className="mono">{t.wins || '–'}</td>
                  <td className="l">
                    <span className="ptbar">
                      <i style={{ width: `${(t.points / maxPts) * 100}%`, background: t.color }} />
                      <b>{t.points}</b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
