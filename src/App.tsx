import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RULES,
  createWorld, tick, makeSnapshot, applyDecision, flightCommand, setWeatherSource,
  SCENARIOS, clockHM, clockHMS,
} from './sim'
import { parseMetars } from './wx'
import type { LiveState } from './wx'
import type { World, Scenario, Settings, Sel, Snap } from './sim'
import MapView from './MapView'
import { KpiStrip, ControlDeck, AdvisoryRail, FlightBoard, ChartsPanel, DetailDrawer, Toasts } from './Panels'
import type { Toast } from './Panels'
import { Icon } from './ui'

const TIME_SCALE = 0.5 // sim-minutes per real second at 1× (30× time)
const LIVE_TIME_SCALE = 1 / 60 // live mode runs in real time
const watHoursNow = () => { const d = new Date(); return ((d.getUTCHours() + 1) % 24) + d.getUTCMinutes() / 60 }

export default function App() {
  const worldRef = useRef<World | null>(null)
  if (!worldRef.current) worldRef.current = createWorld(SCENARIOS.rush, 20261112)
  const configRef = useRef<Scenario>(SCENARIOS.rush)
  const hubRef = useRef('LOS')
  const toastId = useRef(1)

  const [frame, setFrame] = useState(0)
  const [snap, setSnap] = useState<Snap>(() => makeSnapshot(worldRef.current!, 'LOS'))
  const [settings, setSettings] = useState<Settings>({ ...worldRef.current!.settings })
  const [paused, setPaused] = useState(false)
  const [scenario, setScenario] = useState('rush')
  const [hub, setHub] = useState('LOS')
  const [sel, setSel] = useState<Sel>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [liveOn, setLiveOn] = useState(false)
  const [liveState, setLiveState] = useState<LiveState>({ data: {}, fetchedAt: null, error: null })
  const liveOnRef = useRef(false)
  const liveRef = useRef<LiveState>({ data: {}, fetchedAt: null, error: null })
  const setLiveFlag = useCallback((v: boolean) => { liveOnRef.current = v; setLiveOn(v) }, [])
  const setLive = useCallback((s: LiveState) => { liveRef.current = s; setLiveState(s) }, [])

  const refresh = useCallback(() => {
    const w = worldRef.current!
    setSnap(makeSnapshot(w, hubRef.current))
    setSettings({ ...w.settings, layers: { ...w.settings.layers } })
  }, [])

  // Single simulation + render loop
  useEffect(() => {
    let raf = 0, last = performance.now(), snapAcc = 0
    const step = (now: number) => {
      const w = worldRef.current!
      const dtReal = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!w.paused) tick(w, dtReal * (w.liveEnabled ? LIVE_TIME_SCALE : w.settings.speed * TIME_SCALE))
      setFrame(f => (f + 1) % 1e9)
      snapAcc += dtReal
      if (snapAcc > 0.65) { snapAcc = 0; refresh() }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [refresh])

  const pushToast = useCallback((msg: string, undo?: () => void) => {
    const id = toastId.current++
    setToasts(prev => [...prev.slice(-2), { id, msg, undo }])
    window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6500)
  }, [])

  const updateSettings = useCallback((p: Partial<Settings>) => {
    const w = worldRef.current!
    Object.assign(w.settings, p)
    setSettings({ ...w.settings, layers: { ...w.settings.layers } })
    refresh()
  }, [refresh])

  const togglePause = useCallback(() => {
    const w = worldRef.current!
    w.paused = !w.paused
    setPaused(w.paused)
  }, [])

  const loadScenario = useCallback((sc: Scenario, key: string, msg: string) => {
    configRef.current = sc
    worldRef.current = createWorld(sc)
    setLiveFlag(false)
    setScenario(key); setPaused(false); setSel(null)
    refresh()
    pushToast(msg)
  }, [refresh, pushToast, setLiveFlag])

  const randomize = useCallback(() => {
    const sc: Scenario = {
      key: 'custom', label: 'Custom mix', start: 6 + Math.random() * 14,
      density: 25 + Math.round(Math.random() * 65), harmattan: Math.round(Math.random() * 95),
      storms: Math.round(Math.random() * 95), windDir: Math.round(Math.random() * 360),
      windKt: 5 + Math.round(Math.random() * 22),
    }
    loadScenario(sc, 'custom', 'Randomized scenario loaded')
  }, [loadScenario])

  const onScenario = useCallback((key: string) => {
    if (key === 'custom') { randomize(); return }
    loadScenario(SCENARIOS[key], key, `Scenario loaded — ${SCENARIOS[key].label}`)
  }, [loadScenario, randomize])

  const startLive = useCallback(() => {
    const sc: Scenario = {
      key: 'live', label: 'Live weather', start: watHoursNow(), density: 55,
      harmattan: 0, storms: 0, windDir: 210, windKt: 8,
    }
    configRef.current = sc
    const w = createWorld(sc)
    w.live = liveRef.current.data
    setWeatherSource(w, true)
    worldRef.current = w
    setLiveFlag(true); setScenario('live'); setPaused(false); setSel(null)
    refresh()
    pushToast('Live mode: real METAR at LOS and ABV, traffic simulated')
  }, [refresh, pushToast, setLiveFlag])

  const onLive = useCallback((on: boolean) => {
    if (on === liveOnRef.current) return
    if (on) startLive()
    else loadScenario(SCENARIOS.rush, 'rush', 'Back to simulated weather')
  }, [startLive, loadScenario])

  const onReset = useCallback(() => {
    if (liveOnRef.current) { startLive(); return }
    loadScenario(configRef.current, configRef.current.key, 'Scenario reset — fresh traffic picture')
  }, [loadScenario, startLive])

  // Live METAR polling (only while live mode is on). The server caches for 5 minutes.
  useEffect(() => {
    if (!liveOn) return
    let cancelled = false
    const load = async () => {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 20000)
      try {
        const r = await fetch('/api/metar?ids=DNMM,DNAA', { signal: ctrl.signal })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const data = parseMetars(await r.json())
        if (Object.keys(data).length === 0) throw new Error('no METAR data returned')
        if (cancelled) return
        worldRef.current!.live = data
        setLive({ data, fetchedAt: Date.now(), error: null })
      } catch (e) {
        const msg = e instanceof DOMException && e.name === 'AbortError' ? 'request timed out after 20 s'
          : e instanceof Error ? e.message : 'request failed'
        if (!cancelled) setLive({ ...liveRef.current, error: msg })
      } finally {
        window.clearTimeout(timer)
      }
    }
    load()
    const id = window.setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [liveOn, setLive])

  const guardUndo = useCallback((w: World, undo: () => void) => () => {
    if (worldRef.current !== w) { pushToast('Session was reset — nothing to undo'); return }
    undo(); refresh(); pushToast('Action reverted')
  }, [refresh, pushToast])

  const onDecide = useCallback((id: number, accept: boolean, reason?: string) => {
    const w = worldRef.current!
    const res = applyDecision(w, id, accept, reason)
    if (!res) return
    refresh()
    pushToast(res.label, guardUndo(w, res.undo))
  }, [refresh, pushToast, guardUndo])

  const onCommand = useCallback((id: number, cmd: 'vector' | 'hold' | 'clear') => {
    const w = worldRef.current!
    const res = flightCommand(w, id, cmd)
    if (!res) return
    refresh()
    pushToast(res.label, guardUndo(w, res.undo))
  }, [refresh, pushToast, guardUndo])

  const onHub = useCallback((h: string) => { hubRef.current = h; setHub(h); refresh() }, [refresh])
  const onSelect = useCallback((s: Sel) => setSel(s), [])

  const onExport = useCallback(() => {
    const w = worldRef.current!
    const s = makeSnapshot(w, hubRef.current)
    const payload = {
      product: 'SkyGrid NG', mode: 'shadow', exportedAt: new Date().toISOString(),
      sim: { day: s.day, timeWAT: clockHM(s.t), seed: w.seed },
      rules: { ruleSet: RULES.ruleSet, version: RULES.version, status: RULES.status, note: RULES.note },
      weatherSource: w.liveEnabled ? 'live-metar-hybrid' : 'simulated',
      liveWeather: w.liveEnabled ? w.live : undefined,
      settings: w.settings, kpis: s.kpis,
      flights: s.flights.map(f => ({
        callsign: f.callsign, airline: f.airline, type: f.type, squawk: f.squawk,
        origin: f.originCode, destination: f.destCode, diverted: f.diverted,
        alt: f.alt, gs: f.gs, etaWAT: clockHM(f.eta), delayMin: f.delay, phase: f.phase, wxRisk: f.wx,
      })),
      airports: s.airports.map(a => ({ code: a.code, icao: a.icao, activeRunway: a.activeRunway, visibilityM: a.vis, demand: a.demand, capacity: a.cap, metering: a.metering, lvp: a.lvp })),
      advisories: s.advisories, decisions: s.decisions, scorecard: s.scorecard,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skygrid-snapshot-day${s.day}-${clockHM(s.t).replace(':', '')}.json`
    a.click()
    URL.revokeObjectURL(url)
    pushToast('Snapshot exported as JSON')
  }, [pushToast])

  // Keyboard: Space = pause, Esc = close drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); togglePause() }
      if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause])

  const w = worldRef.current!
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">
            <svg width="30" height="30" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" fill="none" stroke="var(--radar)" strokeWidth="1.6" opacity="0.9" />
              <circle cx="16" cy="16" r="8" fill="none" stroke="var(--radar)" strokeWidth="1" opacity="0.35" />
              <g className="logo-sweep"><path d="M16 16L16 2A14 14 0 0 1 27 7Z" fill="var(--radar)" opacity="0.25" /></g>
              <path d="M16 16L26 8" stroke="var(--radar)" strokeWidth="1.6" />
              <circle cx="16" cy="16" r="2.4" fill="var(--radar)" />
            </svg>
          </span>
          <div className="brand-text">
            <strong>SKYGRID<span>NG</span></strong>
            <span className="brand-sub">Airspace Intelligence · Nigeria FIR</span>
          </div>
        </div>
        <span className="badge-shadow mono"><i />SHADOW MODE</span>
        {liveOn && <span className="badge-live mono"><i />LIVE METAR · TRAFFIC SIMULATED</span>}
        <div className="clockbox">
          <strong className="clock mono">{clockHMS(w.t)} <em>WAT</em></strong>
          <span className="clock-sub mono">DAY {w.day} · {settings.speed}× {paused ? '· PAUSED' : ''}</span>
        </div>
        <div className="top-actions">
          <button className="btn" onClick={togglePause} aria-label={paused ? 'Run simulation' : 'Pause simulation'}>
            <Icon name={paused ? 'play' : 'pause'} size={14} />{paused ? 'Run' : 'Pause'}
          </button>
          <button className="btn primary" onClick={onExport}><Icon name="download" size={14} />Export</button>
        </div>
      </header>

      <main>
        <KpiStrip k={snap.kpis} />
        <div className="main-grid">
          <div className="col-left">
            <section className="panel map-panel">
              <MapView world={w} frame={frame} sel={sel} onSelect={onSelect} />
            </section>
            <ControlDeck settings={settings} paused={paused} scenario={scenario} liveOn={liveOn} live={liveState} onLive={onLive}
              onSettings={updateSettings} onPause={togglePause} onScenario={onScenario}
              onReset={onReset} onRandom={randomize} onExport={onExport} />
          </div>
          <AdvisoryRail snap={snap} onDecide={onDecide} />
        </div>
        <div className="bottom-grid">
          <FlightBoard flights={snap.flights} sel={sel} onSelect={onSelect} />
          <ChartsPanel snap={snap} hub={hub} onHub={onHub} />
        </div>
        <footer className="foot">
          <span><Icon name="alert" size={12} /> {liveOn ? 'Hybrid mode: live NOAA METAR at LOS and ABV; traffic and all other weather simulated.' : 'Simulated ADS-B / NiMet-style feeds for demonstration.'} Advisory only — not for operational use. Controllers retain full authority.</span>
          <span className="mono">SKYGRID NG v0.4.2 · REACT + VITE · DEPLOY: VERCEL</span>
        </footer>
      </main>

      <DetailDrawer snap={snap} sel={sel} settings={settings} onClose={() => setSel(null)} onCommand={onCommand} onSelect={onSelect} />
      <Toasts items={toasts}
        onUndo={t => { t.undo?.(); setToasts(prev => prev.filter(x => x.id !== t.id)) }}
        onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </div>
  )
}