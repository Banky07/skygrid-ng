import { useEffect, useMemo, useState } from 'react'
import {
  AIRPORTS, SCENARIOS, DISMISS_REASONS, clockHM, fmtFL, flightStatus, STATUS_TONE, nmDist, proj,
} from './sim'
import { RULES } from './sim'
import { LIVE_FIELDS, ageMin, describeWx } from './wx'
import type { LiveState } from './wx'
import type { Snap, Settings, Sel, Flight, SnapAirport, Advisory } from './sim'
import { Icon, Slider, Toggle, Chip } from './ui'

// ── KPI strip ────────────────────────────────────────────────────────────────
export function KpiStrip({ k }: { k: Snap['kpis'] }) {
  // In live mode only the weather at the live fields is real; tag the rest so nothing reads as real traffic.
  const sim = k.liveMode ? 'SIM' : ''
  const cards = [
    { icon: 'plane', label: 'Airborne now', value: String(k.airborne), sub: k.liveMode ? 'simulated tracks' : 'live tracks', tone: 'ok', tag: sim },
    { icon: 'tower', label: 'Movements today', value: String(k.movements), sub: `${k.diverted} diversions`, tone: 'cyan', tag: sim },
    { icon: 'clock', label: 'Avg delay', value: k.avgDelay + 'm', sub: 'network mean', tone: k.avgDelay >= 12 ? 'warn' : 'ok', tag: sim },
    k.liveMode
      ? { icon: 'haze', label: 'WX-impacted fields', value: String(k.wxFields), sub: k.liveFields > 0 ? `of ${k.liveFields} live fields` : 'no live weather', tone: k.wxFields > 0 ? 'warn' : 'ok', tag: 'LIVE' }
      : { icon: 'haze', label: 'WX-impacted fields', value: String(k.wxFields), sub: 'of 12 airports', tone: k.wxFields > 3 ? 'warn' : 'ok', tag: '' },
    { icon: 'alert', label: 'Pending advisories', value: String(k.pending), sub: 'awaiting decision', tone: k.pending > 0 ? 'warn' : 'ok', tag: '' },
    { icon: 'gauge', label: 'Network load', value: Math.round(k.load * 100) + '%', sub: 'demand / capacity', tone: k.load > 1 ? 'bad' : k.load > 0.85 ? 'warn' : 'ok', tag: sim },
  ]
  return (
    <section className="kpis">
      {cards.map(c => (
        <div className={'kpi kpi-' + c.tone} key={c.label}>
          <span className="kpi-ico"><Icon name={c.icon} size={17} /></span>
          <div>
            <span className="kpi-label">{c.label}{c.tag && <em className={'kpi-tag mono' + (c.tag === 'LIVE' ? ' live' : '')}>{c.tag}</em>}</span>
            <strong className="kpi-value mono">{c.value}</strong>
            <span className="kpi-sub">{c.sub}</span>
          </div>
        </div>
      ))}
    </section>
  )
}

// ── Control deck (always visible, live) ──────────────────────────────────────
export function ControlDeck({ settings, paused, scenario, liveOn, live, onLive, onSettings, onPause, onScenario, onReset, onRandom, onExport }: {
  settings: Settings; paused: boolean; scenario: string
  liveOn: boolean; live: LiveState; onLive: (on: boolean) => void
  onSettings: (p: Partial<Settings>) => void; onPause: () => void
  onScenario: (k: string) => void; onReset: () => void; onRandom: () => void; onExport: () => void
}) {
  const s = settings
  const setLayer = (k: keyof Settings['layers'], v: boolean) => onSettings({ layers: { ...s.layers, [k]: v } })
  return (
    <section className="panel deck">
      <div className="panel-head">
        <span className="panel-title"><Icon name="layers" size={14} /> Simulation control deck</span>
        <div className="deck-actions">
          <select className="sel" value={scenario} disabled={liveOn} onChange={e => onScenario(e.target.value)} aria-label="Scenario">
            {liveOn && <option value="live">Live (real time)</option>}
            {Object.values(SCENARIOS).map(sc => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
            <option value="custom">Custom mix</option>
          </select>
          <button className="btn primary sm" onClick={onPause}><Icon name={paused ? 'play' : 'pause'} size={13} />{paused ? 'Run' : 'Pause'}</button>
          <button className="btn sm" onClick={onReset}><Icon name="reset" size={13} />Reset</button>
          <button className="btn sm" onClick={onRandom}><Icon name="shuffle" size={13} />Randomize</button>
          <button className="btn sm" onClick={onExport}><Icon name="download" size={13} />Export</button>
        </div>
      </div>
      <div className="deck-grid">
        <Slider label="Sim speed" value={s.speed} min={0.5} max={8} step={0.5} unit="×" accent="var(--cyan)" onChange={v => onSettings({ speed: v })} />
        <Slider label="Traffic density" value={s.density} min={10} max={100} unit="%" onChange={v => onSettings({ density: v })} />
        <Slider label="Harmattan intensity" value={s.harmattan} min={0} max={100} unit="%" accent="var(--sand)" onChange={v => onSettings({ harmattan: v })} />
        <Slider label="Storm activity" value={s.storms} min={0} max={100} unit="%" accent="var(--storm)" onChange={v => onSettings({ storms: v })} />
        <Slider label="Wind direction" value={Math.round(s.windDir)} min={0} max={360} step={5} unit="°" accent="var(--cyan)" onChange={v => onSettings({ windDir: v })} />
        <Slider label="Wind speed" value={Math.round(s.windKt)} min={4} max={30} unit="kt" accent="var(--blue)" onChange={v => onSettings({ windKt: v })} />
      </div>
      <div className="toggle-row">
        <span className="toggle-hint mono">LAYERS</span>
        <Toggle label="Weather" on={s.layers.weather} onChange={v => setLayer('weather', v)} />
        <Toggle label="Routes" on={s.layers.routes} onChange={v => setLayer('routes', v)} />
        <Toggle label="Trails" on={s.layers.trails} onChange={v => setLayer('trails', v)} />
        <Toggle label="Labels" on={s.layers.labels} onChange={v => setLayer('labels', v)} />
      </div>
      <div className="wx-row">
        <span className="toggle-hint mono">WEATHER SOURCE</span>
        <div className="seg" role="group" aria-label="Weather source">
          <button className={'seg-btn' + (!liveOn ? ' on' : '')} onClick={() => onLive(false)}>Simulated</button>
          <button className={'seg-btn' + (liveOn ? ' on' : '')} onClick={() => onLive(true)}>Live METAR · LOS, ABV</button>
        </div>
        {liveOn && (
          <div className="wx-lines">
            {Object.keys(live.data).length === 0 && !live.error && <p className="wx-line dim">Fetching live weather…</p>}
            {Object.keys(live.data).length === 0 && live.error && (
              <p className="wx-line stale">Live weather unavailable ({live.error}). LOS and ABV are using simulated weather.</p>
            )}
            {Object.values(LIVE_FIELDS).map(code => {
              const wx = live.data[code]
              if (!wx) return null
              const age = ageMin(wx, Date.now())
              const state = age > RULES.live.unusableAfterMin ? 'unusable' : age > RULES.live.staleAfterMin ? 'stale' : 'ok'
              return (
                <p key={code} className={'wx-line' + (state !== 'ok' ? ' stale' : '')}>
                  <b className="mono">{code}</b> {describeWx(wx)} · {age} min old
                  {state === 'stale' ? ' · STALE' : state === 'unusable' ? ' · TOO OLD, using simulated weather' : ''}
                </p>
              )
            })}
            {Object.keys(live.data).length > 0 && live.error && (
              <p className="wx-line stale">Last refresh failed ({live.error}); showing the previous report.</p>
            )}
            <p className="wx-line dim">
              Live mode runs in real time. Weather at LOS and ABV is real; traffic and all other weather are simulated,
              and the sliders above affect simulated fields only.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Advisory rail ────────────────────────────────────────────────────────────
const ADV_ICON: Record<string, string> = { METER: 'gauge', CONVECTIVE: 'bolt', TSREP: 'bolt', RUNWAY: 'wind', LVP: 'haze', BRIEF: 'info' }

export function AdvisoryRail({ snap, onDecide }: { snap: Snap; onDecide: (id: number, accept: boolean, reason?: string) => void }) {
  const [tab, setTab] = useState<'pending' | 'log' | 'score' | 'feed'>('pending')
  const pending = snap.advisories.filter(a => a.status === 'pending')
  return (
    <section className="panel rail">
      <div className="rail-banner mono"><Icon name="radar" size={13} /> AI RECOMMENDS · YOU DECIDE</div>
      <div className="rail-note mono">
        Rules v{RULES.version} · placeholder thresholds · {snap.kpis.liveMode ? 'live weather at LOS, ABV · simulated traffic' : 'simulated data'}
      </div>
      <div className="tabs">
        <button className={'tab' + (tab === 'pending' ? ' on' : '')} onClick={() => setTab('pending')}>
          Advisories {pending.length > 0 && <span className="tab-badge">{pending.length}</span>}
        </button>
        <button className={'tab' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Decision log</button>
        <button className={'tab' + (tab === 'score' ? ' on' : '')} onClick={() => setTab('score')}>Scorecard</button>
        <button className={'tab' + (tab === 'feed' ? ' on' : '')} onClick={() => setTab('feed')}>Activity</button>
      </div>

      {tab === 'pending' && (
        <div className="adv-list">
          {pending.length === 0 && (
            <div className="empty"><Icon name="radar" size={26} /><p>No pending advisories.<br />Network nominal — monitoring weather &amp; flow.</p></div>
          )}
          {pending.map(a => <AdvCard key={a.id} a={a} t={snap.t} onDecide={onDecide} />)}
        </div>
      )}
      {tab === 'log' && (
        <div className="log-list">
          {snap.decisions.length === 0 && (
            <div className="empty"><Icon name="eye" size={26} /><p>Your concur / dismiss decisions are logged here as an audit trail.</p></div>
          )}
          {snap.decisions.map(d => (
            <div className="log-item" key={d.id}>
              <span className="mono log-time">{clockHM(d.at)}</span>
              <Chip tone={d.action === 'CONCURRED' ? 'ok' : d.action === 'DISMISSED' ? 'dim' : d.action === 'REVERTED' ? 'warn' : 'cyan'}>{d.action}</Chip>
              <span className="log-text">{d.text}{d.reason ? ' · ' + (DISMISS_REASONS.find(r => r.id === d.reason)?.label ?? d.reason) : ''}</span>
              <span className="log-actor mono">{d.ruleId ? d.ruleId + ' · ' : ''}{d.operator}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'score' && <Scorecard snap={snap} />}
      {tab === 'feed' && (
        <div className="feed-list">
          {snap.events.map((e, i) => (
            <div className="feed-item" key={i}>
              <span className="mono feed-time">{clockHM(e.at)}</span>
              <i className={'feed-dot fd-' + e.kind} />
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function AdvCard({ a, t, onDecide }: { a: Advisory; t: number; onDecide: (id: number, accept: boolean, reason?: string) => void }) {
  const [asking, setAsking] = useState(false)
  return (
    <article className={'adv sev-' + a.sev}>
      <div className="adv-head">
        <span className="adv-ico"><Icon name={ADV_ICON[a.type]} size={15} /></span>
        <strong className="adv-title">{a.title}</strong>
        <Chip tone={a.sev === 'warning' ? 'bad' : a.sev === 'caution' ? 'warn' : 'cyan'}>{a.sev.toUpperCase()}</Chip>
      </div>
      <p className="adv-body">{a.body}</p>
      <div className="adv-rule mono">
        {a.ruleId} · rules v{a.ruleVersion}
        {a.sourceObsMs !== undefined && (() => {
          const age = Math.max(0, Math.round((Date.now() - a.sourceObsMs) / 60000))
          return <> · <span className={'adv-age' + (age > RULES.live.staleAfterMin ? ' stale' : '')}>weather report {age} min old</span></>
        })()}
      </div>
      {a.type !== 'BRIEF' && (
        <div className="adv-inputs">
          {Object.entries(a.inputs).map(([k, v]) => <span key={k}>{k} <b>{String(v)}</b></span>)}
        </div>
      )}
      {asking && (
        <div className="adv-ask" role="group" aria-label="Reason for dismissing">
          <span className="adv-ask-label">Why dismiss?</span>
          <div className="reasons">
            {DISMISS_REASONS.map(r => (
              <button key={r.id} className="btn ghost sm" onClick={() => onDecide(a.id, false, r.id)}>{r.label}</button>
            ))}
            <button className="btn ghost sm" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="adv-foot">
        <span className="mono adv-time">{clockHM(a.at)} WAT · {Math.max(0, Math.round(t - a.at))}m ago</span>
        {!asking && (
          <div>
            <button className="btn ghost sm" onClick={() => (a.type === 'BRIEF' ? onDecide(a.id, false) : setAsking(true))}>Dismiss</button>
            <button className="btn primary sm" onClick={() => onDecide(a.id, true)}><Icon name="check" size={13} />Concur</button>
          </div>
        )}
      </div>
    </article>
  )
}

function Scorecard({ snap }: { snap: Snap }) {
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) + '%' : '–')
  return (
    <div className="score">
      <p className="score-note">
        Rules v{RULES.version} ({RULES.status}). “Still valid” means the condition that raised an advisory
        was still present after its check window. It shows whether a rule fired on a lasting situation, not
        whether following it improved anything.
      </p>
      <table>
        <thead>
          <tr><th>Rule</th><th>Raised</th><th>Concur</th><th>Dismiss</th><th>Expired</th><th>Still valid</th></tr>
        </thead>
        <tbody>
          {snap.scorecard.map(r => (
            <tr key={r.ruleId}>
              <td><span className="mono">{r.ruleId}</span><br /><span className="score-name">{r.name}</span></td>
              <td>{r.raised || '–'}</td>
              <td>{r.concurred || '–'}</td>
              <td>{r.dismissed || '–'}</td>
              <td>{r.expired || '–'}</td>
              <td>{r.verified ? `${r.stillValid}/${r.verified} (${pct(r.stillValid, r.verified)})` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {snap.scorecard.some(r => Object.keys(r.reasons).length > 0) && (
        <div className="score-reasons">
          <span className="score-name">Dismissal reasons</span>
          {snap.scorecard.filter(r => Object.keys(r.reasons).length > 0).map(r => (
            <p key={r.ruleId}>
              <span className="mono">{r.ruleId}</span>{' '}
              {Object.entries(r.reasons).map(([id, n]) => `${DISMISS_REASONS.find(x => x.id === id)?.label ?? id} ×${n}`).join(', ')}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Flight board with saved views ────────────────────────────────────────────
interface View { name: string; search: string; filter: string; sort: string; builtin?: boolean }
const DEFAULT_VIEWS: View[] = [
  { name: 'All traffic', search: '', filter: 'all', sort: 'eta', builtin: true },
  { name: 'Weather risk', search: '', filter: 'weather', sort: 'delay', builtin: true },
  { name: 'Late arrivals', search: '', filter: 'delayed', sort: 'delay', builtin: true },
]
function loadViews(): View[] {
  try {
    const raw = localStorage.getItem('skygrid.views.v1')
    if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.length) return v }
  } catch { /* ignore */ }
  return DEFAULT_VIEWS
}

export function FlightBoard({ flights, sel, onSelect }: { flights: Flight[]; sel: Sel; onSelect: (s: Sel) => void }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('eta')
  const [views, setViews] = useState<View[]>(loadViews)
  const [activeView, setActiveView] = useState<string>('All traffic')
  const [saving, setSaving] = useState(false)
  const [viewName, setViewName] = useState('')

  useEffect(() => {
    try { localStorage.setItem('skygrid.views.v1', JSON.stringify(views)) } catch { /* ignore */ }
  }, [views])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = flights.filter(f => {
      if (q && !(f.callsign + ' ' + f.airline + ' ' + f.type + ' ' + f.originCode + ' ' + f.destCode).toLowerCase().includes(q)) return false
      if (filter === 'enroute') return ['CLIMB', 'CRUISE', 'DESCENT'].includes(f.phase) && !f.diverted
      if (filter === 'delayed') return f.delay >= 8 || f.phase === 'HELD'
      if (filter === 'weather') return f.wx
      if (filter === 'diverted') return f.diverted
      if (filter === 'arrivals') return f.progress > 0.75 && f.phase !== 'LANDED'
      return true
    })
    out = [...out].sort((a, b) =>
      sort === 'delay' ? b.delay - a.delay :
      sort === 'callsign' ? a.callsign.localeCompare(b.callsign) :
      sort === 'alt' ? b.alt - a.alt : a.eta - b.eta)
    return out
  }, [flights, search, filter, sort])

  const applyView = (v: View) => { setSearch(v.search); setFilter(v.filter); setSort(v.sort); setActiveView(v.name) }
  const manual = () => setActiveView('')
  const saveView = () => {
    const name = viewName.trim()
    if (!name) return
    const v: View = { name, search, filter, sort }
    setViews(prev => [...prev.filter(x => x.name !== name), v])
    setActiveView(name); setViewName(''); setSaving(false)
  }

  return (
    <section className="panel board">
      <div className="panel-head">
        <span className="panel-title"><Icon name="plane" size={14} /> Traffic board <b className="mono board-count">{list.length}</b></span>
        <div className="board-tools">
          <span className="search-box">
            <Icon name="search" size={13} />
            <input value={search} placeholder="Search callsign, airline, route…"
              onChange={e => { setSearch(e.target.value); manual() }} aria-label="Search traffic" />
          </span>
          <select className="sel" value={filter} onChange={e => { setFilter(e.target.value); manual() }} aria-label="Filter">
            <option value="all">All traffic</option><option value="enroute">En route</option>
            <option value="delayed">Delayed / held</option><option value="weather">Weather risk</option>
            <option value="diverted">Diverted</option><option value="arrivals">Arrivals</option>
          </select>
          <select className="sel" value={sort} onChange={e => { setSort(e.target.value); manual() }} aria-label="Sort">
            <option value="eta">Sort · ETA</option><option value="delay">Sort · Delay</option>
            <option value="callsign">Sort · Callsign</option><option value="alt">Sort · Altitude</option>
          </select>
        </div>
      </div>
      <div className="views-row">
        {views.map(v => (
          <span key={v.name} className={'view-chip' + (activeView === v.name ? ' on' : '')}>
            <button onClick={() => applyView(v)}>{v.name}</button>
            {!v.builtin && <button className="view-x" aria-label={'Delete view ' + v.name}
              onClick={() => setViews(prev => prev.filter(x => x.name !== v.name))}><Icon name="x" size={10} /></button>}
          </span>
        ))}
        {saving ? (
          <span className="save-view-row">
            <input autoFocus value={viewName} onChange={e => setViewName(e.target.value)} placeholder="View name"
              onKeyDown={e => e.key === 'Enter' && saveView()} aria-label="View name" />
            <button className="btn primary sm" onClick={saveView}><Icon name="check" size={12} />Save</button>
            <button className="btn ghost sm" onClick={() => setSaving(false)}>Cancel</button>
          </span>
        ) : (
          <button className="view-chip add" onClick={() => setSaving(true)}><Icon name="plus" size={11} />Save view</button>
        )}
      </div>
      <div className="table-wrap">
        <table className="board-table">
          <thead>
            <tr><th>Callsign</th><th>Type</th><th>Route</th><th>Status</th><th>ALT</th><th>GS</th><th>ETA</th><th>Delay</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={8} className="td-empty">No tracks match this view.</td></tr>}
            {list.map(f => {
              const status = flightStatus(f)
              const selected = sel?.kind === 'flight' && sel.id === f.id
              return (
                <tr key={f.id} className={(selected ? 'row-sel ' : '') + (f.phase === 'LANDED' ? 'row-dim' : '')}
                  onClick={() => onSelect({ kind: 'flight', id: f.id })}>
                  <td><i className="al-dot" style={{ background: f.airlineColor }} /><b className="mono cs">{f.callsign}</b>{f.wx && <Icon name="bolt" size={11} className="wx-bolt" />}</td>
                  <td className="mono">{f.type}</td>
                  <td className="mono route">{f.originCode} <Icon name="arrow" size={10} /> {f.destCode}{f.diverted && <span className="div-tag">DIV</span>}</td>
                  <td><Chip tone={STATUS_TONE[status]}>{status}</Chip></td>
                  <td className="mono num">{f.phase === 'LANDED' ? '—' : fmtFL(f.alt)}</td>
                  <td className="mono num">{f.phase === 'LANDED' ? '—' : f.gs + 'kt'}</td>
                  <td className="mono num">{clockHM(f.eta)}</td>
                  <td className={'mono num' + (f.delay >= 8 ? ' delay-hot' : '')}>{f.delay > 0 ? '+' + f.delay + 'm' : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Charts ───────────────────────────────────────────────────────────────────
export function ChartsPanel({ snap, hub, onHub }: { snap: Snap; hub: string; onHub: (h: string) => void }) {
  const majors = AIRPORTS.filter(a => a.weight >= 3.5)
  const b = snap.forecast
  const maxV = Math.max(4, ...b.flatMap(x => [x.demand, x.capacity]))
  const hist = snap.history.slice(-28)
  const hMax = Math.max(6, ...hist.map(h => h.v))
  const pts = hist.map((h, i) => [30 + (i * 280) / Math.max(1, hist.length - 1), 128 - (h.v / hMax) * 104] as [number, number])
  const line = pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')
  const area = pts.length > 1 ? `M${pts[0][0]},128 L${line.split(' ').join(' L')} L${pts[pts.length - 1][0]},128 Z` : ''
  const last = hist[hist.length - 1]
  return (
    <section className="panel charts">
      <div className="panel-head">
        <span className="panel-title"><Icon name="gauge" size={14} /> Flow &amp; delay analytics</span>
        <select className="sel" value={hub} onChange={e => onHub(e.target.value)} aria-label="Hub">
          {majors.map(a => <option key={a.code} value={a.code}>{a.code} — {a.city}</option>)}
        </select>
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">Demand vs weather-adjusted capacity · next 6h
            <span className="legend mono"><i style={{ background: 'var(--cyan)' }} />DEMAND <i style={{ background: 'var(--radar)' }} />CAPACITY <i style={{ background: 'var(--red)' }} />OVERLOAD</span>
          </div>
          <svg viewBox="0 0 340 158" className="chart-svg">
            {[0, 0.5, 1].map(f => {
              const y = 126 - f * 112
              return <g key={f}><line x1={30} y1={y} x2={332} y2={y} className="grid-l" /><text x={26} y={y + 3} textAnchor="end" className="ax">{Math.round(maxV * f)}</text></g>
            })}
            {b.map((bk, i) => {
              const x = 36 + i * 49
              const dh = (bk.demand / maxV) * 112, ch = (bk.capacity / maxV) * 112
              return (
                <g key={i}>
                  <rect x={x} y={126 - dh} width={14} height={dh} rx={2} fill={bk.over ? 'var(--red)' : 'var(--cyan)'} opacity={0.9} />
                  <rect x={x + 17} y={126 - ch} width={14} height={ch} rx={2} fill="var(--radar)" opacity={0.75} />
                  <text x={x + 7} y={122 - dh} textAnchor="middle" className="bv">{bk.demand}</text>
                  <text x={x + 24} y={122 - ch} textAnchor="middle" className="bv cap">{bk.capacity}</text>
                  <text x={x + 15} y={142} textAnchor="middle" className="ax">{bk.label}</text>
                </g>
              )
            })}
            <line x1={30} y1={126} x2={332} y2={126} className="base-l" />
          </svg>
        </div>
        <div className="chart-card">
          <div className="chart-title">Network delay trend
            <span className="legend mono"><i style={{ background: 'var(--amber)' }} />AVG MIN · 5-MIN SAMPLES</span>
          </div>
          <svg viewBox="0 0 340 158" className="chart-svg">
            {[0, 0.5, 1].map(f => {
              const y = 128 - f * 104
              return <g key={f}><line x1={30} y1={y} x2={332} y2={y} className="grid-l" /><text x={26} y={y + 3} textAnchor="end" className="ax">{Math.round(hMax * f)}</text></g>
            })}
            {area && <path d={area} fill="var(--amber)" opacity={0.12} />}
            {pts.length > 1 && <polyline points={line} fill="none" stroke="var(--amber)" strokeWidth={2} strokeLinejoin="round" />}
            {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill="var(--amber)" />}
            <text x={34} y={22} className="big-val">{last ? last.v : 0} min</text>
            <text x={34} y={36} className="ax">current network average</text>
          </svg>
        </div>
      </div>
    </section>
  )
}

// ── Detail drawer ────────────────────────────────────────────────────────────
export function DetailDrawer({ snap, sel, settings, onClose, onCommand, onSelect }: {
  snap: Snap; sel: Sel; settings: Settings
  onClose: () => void; onCommand: (id: number, cmd: 'vector' | 'hold' | 'clear') => void; onSelect: (s: Sel) => void
}) {
  if (!sel) return null
  const flight = sel.kind === 'flight' ? snap.flights.find(f => f.id === sel.id) : undefined
  const airport = sel.kind === 'airport' ? snap.airports.find(a => a.code === sel.id) : undefined
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Detail panel">
        {sel.kind === 'flight' && (flight ? <FlightDetail f={flight} snap={snap} onCommand={onCommand} onClose={onClose} />
          : <div className="drawer-head"><div><h2 className="mono">Flight completed</h2><span className="d-airline">This track has landed and left the board.</span></div>
            <button className="btn icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={15} /></button></div>)}
        {airport && <AirportDetail a={airport} snap={snap} settings={settings} onClose={onClose} onSelect={onSelect} />}
      </aside>
    </>
  )
}

function FlightDetail({ f, snap, onCommand, onClose }: {
  f: Flight; snap: Snap; onCommand: (id: number, cmd: 'vector' | 'hold' | 'clear') => void; onClose: () => void
}) {
  const status = flightStatus(f)
  let nearest = Infinity, nSev = 0
  for (const c of snap.cells) {
    const d = nmDist(f.lon, f.lat, c.lon, c.lat) - c.effR
    if (d < nearest) { nearest = d; nSev = c.sev }
  }
  const threatened = nearest < 30
  const profPts = Array.from({ length: 25 }, (_, i) => {
    const p = i / 24
    const prof = Math.min(1, p / 0.16, (1 - p) / 0.2)
    return [10 + p * 300, 62 - (0.25 + 0.75 * prof) * 48] as [number, number]
  })
  const landed = f.phase === 'LANDED'
  return (
    <>
      <div className="drawer-head">
        <div>
          <h2 className="mono d-callsign"><i className="al-dot big" style={{ background: f.airlineColor }} />{f.callsign}</h2>
          <span className="d-airline">{f.airline}</span>
        </div>
        <button className="btn icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={15} /></button>
      </div>
      <div className="d-chips">
        <Chip tone="cyan">{f.type}</Chip><Chip tone="dim">SQK {f.squawk}</Chip>
        <Chip tone={STATUS_TONE[status]}>{status}</Chip>
        {f.rerouted && <Chip tone="cyan">VECTORED</Chip>}
      </div>
      <div className="d-section">
        <div className="d-route mono">
          <span>{f.originCode}</span>
          <span className="d-progress"><i style={{ width: Math.round(f.progress * 100) + '%' }} />
            <b style={{ left: Math.round(f.progress * 100) + '%' }}><Icon name="plane" size={13} /></b></span>
          <span>{f.destCode}{f.diverted && <em className="div-tag">DIV</em>}</span>
        </div>
        <div className="d-stats">
          <div className="d-stat"><span>ALT</span><b className="mono">{f.phase === 'LANDED' ? '—' : fmtFL(f.alt)}</b></div>
          <div className="d-stat"><span>GS</span><b className="mono">{f.phase === 'LANDED' ? '—' : f.gs + 'kt'}</b></div>
          <div className="d-stat"><span>ETA</span><b className="mono">{clockHM(f.eta)}</b></div>
          <div className="d-stat"><span>DELAY</span><b className={'mono' + (f.delay >= 8 ? ' delay-hot' : '')}>{f.delay > 0 ? '+' + f.delay + 'm' : '0m'}</b></div>
        </div>
      </div>
      <div className="d-section">
        <span className="d-label">Vertical profile</span>
        <svg viewBox="0 0 320 70" className="profile-svg">
          <polyline points={profPts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')} fill="none" stroke="var(--cyan)" strokeWidth={1.6} opacity={0.8} />
          <circle cx={10 + f.progress * 300} cy={62 - (0.25 + 0.75 * Math.min(1, f.progress / 0.16, (1 - f.progress) / 0.2)) * 48} r={4} fill="var(--radar)" />
        </svg>
      </div>
      <div className="d-section">
        <span className="d-label">Weather assessment</span>
        <div className={'wx-note ' + (threatened ? 'warn' : 'ok')}>
          <Icon name={threatened ? 'bolt' : 'check'} size={14} />
          {threatened
            ? `CB ${Math.max(0, Math.round(nearest))} NM from track · severity ${nSev}/3 — vectoring recommended.`
            : 'Route clear of convective activity.'}
        </div>
      </div>
      <div className="d-section">
        <span className="d-label">What-if simulation (nothing is sent to aircraft)</span>
        <div className="d-actions">
          <button className="btn sm" disabled={landed} onClick={() => onCommand(f.id, 'vector')}><Icon name="crosshair" size={13} />Simulate vector</button>
          <button className="btn sm" disabled={landed} onClick={() => onCommand(f.id, 'hold')}><Icon name="pause" size={13} />Simulate hold +5 min</button>
          <button className="btn sm" disabled={landed || (f.phase !== 'HELD' && !f.rerouted)} onClick={() => onCommand(f.id, 'clear')}><Icon name="play" size={13} />Simulate resume</button>
        </div>
      </div>
    </>
  )
}

function AirportDetail({ a, snap, settings, onClose, onSelect }: {
  a: SnapAirport; snap: Snap; settings: Settings; onClose: () => void; onSelect: (s: Sel) => void
}) {
  const inbound = snap.flights.filter(f => f.destCode === a.code && f.phase !== 'LANDED').sort((x, y) => x.eta - y.eta).slice(0, 7)
  const maxV = Math.max(a.demand, a.cap, 1)
  const visTxt = a.vis >= 9000 ? '10km+' : (a.vis / 1000).toFixed(1) + 'km'
  return (
    <>
      <div className="drawer-head">
        <div><h2 className="mono d-callsign">{a.code} <small>{a.icao}</small></h2><span className="d-airline">{a.name} · {a.city}</span></div>
        <button className="btn icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={15} /></button>
      </div>
      <div className="d-chips">
        {a.metering && <Chip tone="cyan">METERING</Chip>}
        {(a.lvp || a.vis < 1500) && <Chip tone="warn">LVP</Chip>}
        {a.storm && <Chip tone="storm">CB OVER FIELD</Chip>}
        {!a.wx && <Chip tone="ok">CAVOK-ISH</Chip>}
      </div>
      <div className="d-section d-ap-grid">
        <div><span className="d-label">Active runway</span><b className="rwy-big mono">{a.activeRunway}</b>
          <span className="mono ap-wind">{Math.round(settings.windDir)}° / {Math.round(settings.windKt)}kt</span></div>
        <div><span className="d-label">Visibility</span><b className="rwy-big mono">{visTxt}</b>
          <span className="mono ap-wind">{a.vis < 4000 ? 'harmattan / wx' : 'nominal'}</span></div>
      </div>
      <div className="d-section">
        <span className="d-label">Next hour · demand vs capacity</span>
        <div className="cap-bars">
          <div className="cap-row"><span className="mono">DEM {a.demand}</span><span className="cap-bar"><i style={{ width: (a.demand / maxV) * 100 + '%', background: a.demand > a.cap ? 'var(--red)' : 'var(--cyan)' }} /></span></div>
          <div className="cap-row"><span className="mono">CAP {a.cap}</span><span className="cap-bar"><i style={{ width: (a.cap / maxV) * 100 + '%', background: 'var(--radar)' }} /></span></div>
        </div>
        {a.rec !== a.activeRunway && <p className="ap-hint"><Icon name="wind" size={12} /> Wind favours RWY {a.rec} — change advisory may issue.</p>}
      </div>
      <div className="d-section">
        <span className="d-label">Inbound ({inbound.length})</span>
        <div className="inbound">
          {inbound.length === 0 && <p className="ap-hint">No inbound tracks in the simulation.</p>}
          {inbound.map(f => (
            <button className="inb-row" key={f.id} onClick={() => onSelect({ kind: 'flight', id: f.id })}>
              <i className="al-dot" style={{ background: f.airlineColor }} />
              <b className="mono">{f.callsign}</b>
              <span className="mono inb-eta">{clockHM(f.eta)}</span>
              <Chip tone={STATUS_TONE[flightStatus(f)]}>{flightStatus(f)}</Chip>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Toasts ──────────────────────────────────────────────────────────────────
export interface Toast { id: number; msg: string; undo?: () => void }
export function Toasts({ items, onUndo, onDismiss }: { items: Toast[]; onUndo: (t: Toast) => void; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map(t => (
        <div className="toast" key={t.id}>
          <Icon name="check" size={14} className="toast-ico" />
          <span>{t.msg}</span>
          {t.undo && <button className="toast-undo mono" onClick={() => onUndo(t)}><Icon name="undo" size={12} />UNDO</button>}
          <button className="toast-x" onClick={() => onDismiss(t.id)} aria-label="Dismiss"><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  )
}