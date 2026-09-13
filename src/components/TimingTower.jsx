import React from 'react'
import { lapTime, sector, gap, interval } from '../lib/format.js'
import { tyre, segColor } from '../lib/constants.js'

function Segments({ values }) {
  if (!values || !values.length) return <span className="segs" />
  return (
    <span className="segs">
      {values.map((v, i) => <i key={i} style={{ background: segColor(v) }} />)}
    </span>
  )
}

function Row({ r, selected, onSelect }) {
  const t = tyre(r.compound)
  return (
    <tr
      className={[selected ? 'sel' : '', r.retired ? 'out' : ''].join(' ')}
      onClick={() => onSelect(r.num)}
    >
      <td className="teamstripe" style={{ background: r.color }} />
      <td className="pos l">{r.retired ? '--' : r.pos}</td>
      <td className="l">
        <span className="drv">
          <span className="num">{r.num}</span>
          <span className="tla">{r.tla}</span>
          {r.inPit && <span className="badge pit">PIT</span>}
          {r.retired && <span className="badge out">OUT</span>}
        </span>
      </td>
      <td>
        {r.compound
          ? (<>
              <span className="tyre" style={{ color: t.ring }}>{t.short}</span>
              <span className="tyre-age">{r.tyreAge ?? 0}</span>
            </>)
          : <span style={{ color: 'var(--dim)' }}>--</span>}
      </td>
      <td className="mono">{r.stops || 0}</td>
      <td className="mono" style={{ color: 'var(--text-2)' }}>
        {r.gapLeader == null ? '--' : gap(r.gapLeader)}
      </td>
      <td className="mono">{interval(r.interval, r.gapLeader === 0)}</td>
      <td className={`mono ${r.lapClass}`}>{lapTime(r.lastLap)}</td>
      {[0, 1, 2].map((i) => (
        <td key={i} className="mono">
          <span className="secgrp">
            <span className={r.sectorClass[i]}>{sector(r.secs[i])}</span>
            <Segments values={r.segs[i]} />
          </span>
        </td>
      ))}
      <td className="mono" style={{ color: 'var(--dim)' }}>{r.speedTrap ?? '--'}</td>
    </tr>
  )
}

export default function TimingTower({ rows, selected, onSelect }) {
  return (
    <div className="panel a-tower">
      <div className="panel-head">
        <span className="label">Timing Tower</span>
        <span className="label">{rows.length} cars</span>
      </div>
      <div className="panel-body scroll">
        <table className="tower">
          <thead>
            <tr>
              <th style={{ width: 3, padding: 0 }} />
              <th className="l">P</th>
              <th className="l">Driver</th>
              <th>Tyre</th>
              <th>St</th>
              <th>Leader</th>
              <th>Int</th>
              <th>Last lap</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
              <th>Trap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.num} r={r} selected={selected.includes(r.num)} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="hint">Waiting for the first timing packet…</div>}
      </div>
    </div>
  )
}
