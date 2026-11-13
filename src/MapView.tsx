import { memo } from 'react'
import {
  AIRPORTS, ROUTES, NIGERIA, AP, MAP_W, MAP_H, NM_PX, proj, effR, cellEnv, visAt,
  flightStatus, STATUS_TONE, fmtFL, liveFor,
} from './sim'
import type { World, Sel } from './sim'
import { Icon } from './ui'

const FIR_PATH = 'M' + NIGERIA.map(([lon, lat]) => proj(lon, lat).map(v => v.toFixed(1)).join(' ')).join(' L ') + ' Z'
const TONE_COLOR: Record<string, string> = {
  ok: 'var(--radar)', warn: 'var(--amber)', storm: 'var(--storm)',
  bad: 'var(--red)', cyan: 'var(--cyan)', dim: 'var(--dim)',
}

function MapViewBase({ world, sel, onSelect }: { world: World; frame: number; sel: Sel; onSelect: (s: Sel) => void }) {
  const w = world
  const L = w.settings.layers
  const airborne = w.flights.filter(f => f.phase !== 'LANDED')
  // Declutter: label only selected tracks, trouble (weather, diverted, held), or approaches into a field with a pending advisory.
  const flaggedFields = new Set(w.advisories.filter(a => a.status === 'pending' && a.type !== 'BRIEF').map(a => a.code))
  const hazeY = proj(0, 8)[1]
  // Wind readout: the real Lagos METAR in live mode, otherwise the simulator's setting.
  const losWx = liveFor(w, 'LOS')
  const windSrc = losWx ? 'LOS METAR' : 'SIM'
  const windDirShown = losWx ? losWx.windDir : w.settings.windDir
  const windKtShown = losWx ? losWx.windKt : w.settings.windKt
  const windFlow = ((windDirShown ?? 0) + 180) % 360

  return (
    <div className="map-wrap">
      <svg className="map-svg" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Nigeria FIR shadow traffic picture">
        <defs>
          <linearGradient id="landGrad" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#0c2030" /><stop offset="0.55" stopColor="#0a1a26" /><stop offset="1" stopColor="#0b1d22" />
          </linearGradient>
          <linearGradient id="hazeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e2a86b" stopOpacity="0.55" />
            <stop offset="0.7" stopColor="#e2a86b" stopOpacity="0.22" />
            <stop offset="1" stopColor="#e2a86b" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#43f5a0" stopOpacity="0.14" /><stop offset="1" stopColor="#43f5a0" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="cbGrad">
            <stop offset="0" stopColor="#ff4d5e" stopOpacity="0.5" />
            <stop offset="0.45" stopColor="#c95cff" stopOpacity="0.32" />
            <stop offset="1" stopColor="#c95cff" stopOpacity="0" />
          </radialGradient>
          <clipPath id="firClip"><path d={FIR_PATH} /></clipPath>
        </defs>

        <rect width={MAP_W} height={MAP_H} fill="transparent" onClick={() => onSelect(null)} />

        {/* graticule */}
        <g className="grat">
          {[4, 6, 8, 10, 12, 14].map(lon => {
            const x = proj(lon, 0)[0]
            return <g key={lon}><line x1={x} y1={0} x2={x} y2={MAP_H} /><text x={x + 4} y={MAP_H - 8}>{lon}°E</text></g>
          })}
          {[6, 8, 10, 12].map(lat => {
            const y = proj(0, lat)[1]
            return <g key={lat}><line x1={0} y1={y} x2={MAP_W} y2={y} /><text x={6} y={y - 5}>{lat}°N</text></g>
          })}
        </g>

        <g className="sweep"><path d="M500 390 L500 -170 A560 560 0 0 1 763 -104 Z" fill="url(#sweepGrad)" /></g>

        {/* FIR landmass */}
        <path d={FIR_PATH} className="fir" fill="url(#landGrad)" />

        {/* harmattan haze */}
        {L.weather && w.settings.harmattan > 2 && (
          <g clipPath="url(#firClip)" pointerEvents="none">
            <rect x={0} y={0} width={MAP_W} height={hazeY + 90} fill="url(#hazeGrad)"
              opacity={Math.min(0.85, w.settings.harmattan / 100)} style={{ transition: 'opacity .5s' }} />
          </g>
        )}

        {/* route skeleton */}
        {L.routes && (
          <g className="routes" pointerEvents="none">
            {ROUTES.map(([a, b]) => {
              const [x1, y1] = proj(AP[a].lon, AP[a].lat)
              const [x2, y2] = proj(AP[b].lon, AP[b].lat)
              return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} />
            })}
          </g>
        )}

        {/* convective cells */}
        {L.weather && w.cells.map(c => {
          const [x, y] = proj(c.lon, c.lat)
          const r = effR(c, w.t) * NM_PX
          const env = cellEnv(c, w.t)
          return (
            <g key={c.id} pointerEvents="none" opacity={0.35 + env * 0.65}>
              <circle cx={x} cy={y} r={r * 1.35} fill="url(#cbGrad)" />
              <circle cx={x} cy={y} r={r} fill="none" stroke="var(--storm)" strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />
              <circle cx={x} cy={y} r={r * 0.45} fill="var(--storm)" opacity={0.22} />
              {c.sev === 3 && <path d={`M${x - 3} ${y - 8} l-4 9 h4 l-1 7 6-9 h-4 l2-7 z`} fill="var(--amber)" />}
              {L.labels && <text x={x} y={y - r - 6} className="cb-label" textAnchor="middle">CB · FL{c.tops}{c.sev === 3 ? ' · SEV' : ''}</text>}
            </g>
          )
        })}

        {/* airports */}
        {AIRPORTS.map(a => {
          const [x, y] = proj(a.lon, a.lat)
          const st = w.airports[a.code]
          const vis = visAt(w, a)
          const selected = sel?.kind === 'airport' && sel.id === a.code
          const metering = st.meterUntil > w.t
          const lvp = st.lvpAck > w.t || vis < 1500
          return (
            <g key={a.code} className={'apt' + (selected ? ' apt-sel' : '')} transform={`translate(${x} ${y})`}
              onClick={e => { e.stopPropagation(); onSelect({ kind: 'airport', id: a.code }) }}>
              <title>{a.name} ({a.icao}) — RWY {st.activeRunway}</title>
              {selected && [42, 84, 126].map(r => <circle key={r} r={r} className="range-ring" />)}
              <circle r={11} className="apt-ring" />
              <circle r={3.4} className="apt-dot" />
              <g transform={`rotate(${a.rwys.find(r => r.id === st.activeRunway)?.hdg ?? 0})`}>
                <line x1={0} y1={-13} x2={0} y2={-21} className="rwy-tick" />
              </g>
              {L.labels && (
                <g pointerEvents="none">
                  <text x={14} y={4} className="apt-label">{a.code}</text>
                  {vis < 5000 && <text x={14} y={17} className="apt-vis">{(vis / 1000).toFixed(1)}km</text>}
                  {metering && <text x={-14} y={-14} className="apt-badge" textAnchor="end">METER</text>}
                  {lvp && <text x={-14} y={vis < 5000 ? 30 : 17} className="apt-badge lvp" textAnchor="end">LVP</text>}
                </g>
              )}
            </g>
          )
        })}

        {/* traffic */}
        {airborne.map(f => {
          const status = flightStatus(f)
          const color = TONE_COLOR[STATUS_TONE[status] || 'ok']
          const selected = sel?.kind === 'flight' && sel.id === f.id
          return (
            <g key={f.id} style={{ color }} className="plane" onClick={e => { e.stopPropagation(); onSelect({ kind: 'flight', id: f.id }) }}>
              <title>{f.callsign} · {f.airline} · {f.originCode}→{f.destCode} · {fmtFL(f.alt)}</title>
              {L.trails && f.trail.length > 1 && (
                <polyline points={f.trail.map(p => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.3} />
              )}
              <g transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.hdg.toFixed(1)}) scale(${selected ? 1.35 : 1})`}>
                <circle r={9} fill="currentColor" opacity={0.14} />
                <path d="M0 -8 L2 -2 L8 2 L2 3 L1 8 L0 6 L-1 8 L-2 3 L-8 2 L-2 -2 Z" fill="currentColor" />
              </g>
              {selected && <circle cx={f.x} cy={f.y} r={15} className="sel-ring" />}
              {L.labels && (selected || f.wx || f.diverted || f.phase === 'HELD' || (f.phase === 'DESCENT' && flaggedFields.has(f.destCode))) && (
                <text x={f.x + 11} y={f.y - 9} className="plane-label" pointerEvents="none">
                  {f.callsign} · {fmtFL(f.alt)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="map-hud">
        <div className="hud-left">
          <span className="hud-title">NIGERIA FIR — SHADOW PICTURE</span>
          <span className="hud-sub mono">{airborne.length} AIRBORNE · {w.cells.length} CB CELLS · SIM FEED</span>
        </div>
        <div className="hud-right mono">
          {windDirShown !== null && (
            <svg width="26" height="26" viewBox="0 0 26 26" style={{ transform: `rotate(${windFlow}deg)` }}>
              <path d="M13 3 L17 15 L13 12 L9 15 Z" fill="var(--cyan)" />
            </svg>
          )}
          <span>{windSrc} · {windDirShown === null ? 'VRB' : Math.round(windDirShown) + '°'} / {Math.round(windKtShown)}KT</span>
        </div>
      </div>

      <div className="map-legend mono">
        <span><i style={{ background: 'var(--radar)' }} />ENROUTE</span>
        <span><i style={{ background: 'var(--amber)' }} />DELAYED</span>
        <span><i style={{ background: 'var(--storm)' }} />WEATHER</span>
        <span><i style={{ background: 'var(--red)' }} />DIVERTED</span>
        <span><i style={{ background: 'var(--cyan)' }} />HELD</span>
        <span className="lg-note"><Icon name="info" size={11} /> Illustrative boundary · simulated tracks</span>
      </div>
    </div>
  )
}

const MapView = memo(MapViewBase, (a, b) => a.frame === b.frame && a.sel === b.sel && a.world === b.world)
export default MapView