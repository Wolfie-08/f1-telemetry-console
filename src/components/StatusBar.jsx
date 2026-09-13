import React from 'react'

export default function StatusBar({ stats, store, phase, error, live }) {
  const lastSample = store.lastSampleAt
  const lagMs = lastSample ? Date.now() - lastSample : null
  return (
    <div className="statusbar">
      <span>openf1 <b>{phase}</b></span>
      <span>req <b>{stats.sent}</b></span>
      <span>queued <b>{stats.queued}</b></span>
      <span>429 <b style={{ color: stats.throttled ? 'var(--yellow)' : undefined }}>{stats.throttled}</b></span>
      <span>fail <b style={{ color: stats.failed ? 'var(--red)' : undefined }}>{stats.failed}</b></span>
      {live && (
        <span>feed <b style={{ color: lagMs > 20000 ? 'var(--yellow)' : 'var(--green)' }}>
          {lagMs == null ? '--' : `${(lagMs / 1000).toFixed(1)}s ago`}
        </b></span>
      )}
      <span style={{ marginLeft: 'auto', color: error ? 'var(--red)' : 'var(--dim)' }}>
        {error || `${store.driverNums.length} drivers · session ${store.session?.session_key ?? '--'}`}
      </span>
    </div>
  )
}
