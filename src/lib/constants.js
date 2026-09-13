// ---------------------------------------------------------------------------
// Static reference data: colours, compound styling, mini-sector segment codes.
// ---------------------------------------------------------------------------

export const TYRE = {
  SOFT:         { short: 'S', color: '#ff2d2d', ring: '#ff2d2d' },
  MEDIUM:       { short: 'M', color: '#ffd93d', ring: '#ffd93d' },
  HARD:         { short: 'H', color: '#e8e8e8', ring: '#e8e8e8' },
  INTERMEDIATE: { short: 'I', color: '#2fd35c', ring: '#2fd35c' },
  WET:          { short: 'W', color: '#2f7dff', ring: '#2f7dff' },
  UNKNOWN:      { short: '?', color: '#6b7280', ring: '#6b7280' },
}
export const tyre = (c) => TYRE[(c || '').toUpperCase()] || TYRE.UNKNOWN

// F1 live-timing mini-sector segment codes.
export const SEGMENT = {
  0:    '#2a3038', // not available
  2048: '#c9a227', // yellow  (slower than own best)
  2049: '#2fd35c', // green   (personal best)
  2050: '#2a3038',
  2051: '#b45cff', // purple  (session best)
  2052: '#2a3038',
  2064: '#2f7dff', // pit lane
  2068: '#2a3038',
}
export const segColor = (v) => SEGMENT[v] ?? '#2a3038'

// Fallback if the API omits team_colour.
export const FALLBACK_TEAM = '#8b95a5'

export const FLAG_STYLE = {
  GREEN:        { bg: '#0f7a34', fg: '#ffffff', label: 'GREEN' },
  YELLOW:       { bg: '#c9a227', fg: '#10131a', label: 'YELLOW' },
  DOUBLE_YELLOW:{ bg: '#c9a227', fg: '#10131a', label: '2x YELLOW' },
  RED:          { bg: '#b3131c', fg: '#ffffff', label: 'RED' },
  BLUE:         { bg: '#1f5fd0', fg: '#ffffff', label: 'BLUE' },
  CHEQUERED:    { bg: '#e8e8e8', fg: '#10131a', label: 'CHEQUERED' },
  CLEAR:        { bg: '#1a1f27', fg: '#8b95a5', label: 'CLEAR' },
}
