import type { CSSProperties } from 'react'

const PATHS: Record<string, { d: string; fill?: boolean }[]> = {
  plane: [{ d: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z', fill: true }],
  radar: [{ d: 'M12 3a9 9 0 1 0 9 9' }, { d: 'M12 12l6.5-6.5' }, { d: 'M12 12m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0', fill: true }],
  play: [{ d: 'M8 5v14l11-7z', fill: true }],
  pause: [{ d: 'M7 5h4v14H7zM13 5h4v14h-4z', fill: true }],
  reset: [{ d: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5' }],
  shuffle: [{ d: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5' }],
  download: [{ d: 'M12 3v12M8 11l4 4 4-4M4 21h16' }],
  x: [{ d: 'M6 6l12 12M18 6L6 18' }],
  check: [{ d: 'M5 13l4 4L19 7' }],
  search: [{ d: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM21 21l-4.3-4.3' }],
  wind: [{ d: 'M3 8h10a3 3 0 1 0-3-4M3 12h15a3 3 0 1 1-3 4M3 16h7' }],
  bolt: [{ d: 'M13 2L4 14h6l-1 8 9-12h-6l1-8z', fill: true }],
  haze: [{ d: 'M3 8h18M5 12h14M3 16h18M7 20h10' }],
  clock: [{ d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2' }],
  layers: [{ d: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5' }],
  save: [{ d: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6' }],
  trash: [{ d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' }],
  undo: [{ d: 'M4 10h10a5 5 0 0 1 0 10h-3M4 10l4-4M4 10l4 4' }],
  alert: [{ d: 'M12 3l10 18H2L12 3zM12 10v4M12 17.5v.5' }],
  info: [{ d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8v.5M12 11v5' }],
  gauge: [{ d: 'M5 19a9 9 0 1 1 14 0M12 15l4-5' }],
  tower: [{ d: 'M12 3v4M9 7h6l-1 5h-4L9 7zM10 12l-1 9M14 12l1 9M7 21h10' }],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  chevron: [{ d: 'M6 9l6 6 6-6' }],
  crosshair: [{ d: 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM12 2v4M12 18v4M2 12h4M18 12h4' }],
  arrow: [{ d: 'M4 12h16M14 6l6 6-6 6' }],
  eye: [{ d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z' }],
}

export function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  const paths = PATHS[name] || PATHS.info
  return (
    <svg className={'ico ' + className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} stroke={p.fill ? 'none' : 'currentColor'} />)}
    </svg>
  )
}

export function Slider({ label, value, min, max, step = 1, unit = '', accent = 'var(--radar)', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; accent?: string
  onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  const shown = step < 1 ? value.toFixed(1) : Math.round(value)
  return (
    <label className="ctl">
      <span className="ctl-head"><span>{label}</span><b className="mono">{shown}{unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ '--p': pct + '%', '--acc': accent } as CSSProperties}
        onChange={e => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  )
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={'switch' + (on ? ' on' : '')} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="sw-track"><span className="knob" /></span>
      <span className="sw-label">{label}</span>
    </button>
  )
}

export function Chip({ tone = 'dim', children }: { tone?: string; children: React.ReactNode }) {
  return <span className={'chip chip-' + tone}>{children}</span>
}