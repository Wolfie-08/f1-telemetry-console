import React from 'react'
import { clockAt } from '../lib/format.js'

const flagClass = (r) => {
  const f = (r.flag || '').toUpperCase()
  if (f.includes('RED')) return 'flag-red'
  if (f.includes('YELLOW')) return 'flag-yellow'
  if (f.includes('GREEN') || f.includes('CLEAR')) return 'flag-green'
  if (f.includes('CHEQUERED')) return 'flag-chequered'
  if (r.category === 'SafetyCar') return 'flag-yellow'
  return ''
}

export default function RaceControlFeed({ messages, gmt }) {
  const list = [...messages].reverse().slice(0, 120)
  return (
    <div className="panel a-rc">
      <div className="panel-head">
        <span className="label">Race Control</span>
        <span className="label">{messages.length}</span>
      </div>
      <div className="panel-body scroll">
        {list.map((r, i) => (
          <div key={`${r.date}-${i}`} className={`rc-item ${flagClass(r)}`}>
            <time>{clockAt(r.date, gmt)}</time>
            <div>
              {r.lap_number != null && (
                <span style={{ color: 'var(--dim)', marginRight: 6 }}>L{r.lap_number}</span>
              )}
              {r.message}
            </div>
          </div>
        ))}
        {!list.length && <div className="hint">No messages yet.</div>}
      </div>
    </div>
  )
}
