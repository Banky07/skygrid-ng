// ─────────────────────────────────────────────────────────────────────────────
// SkyGrid NG · shadow-mode airspace simulation engine (seeded, deterministic)
// Simulated ADS-B / NiMet-style feeds. Advisory only — never issues clearances.
// ─────────────────────────────────────────────────────────────────────────────

export const MAP_W = 1000
export const MAP_H = 780
const LON0 = 2.3, LON1 = 15.0, LAT0 = 3.7, LAT1 = 14.2
export const NM_PX = MAP_H / ((LAT1 - LAT0) * 60)

export const proj = (lon: number, lat: number): [number, number] => [
  ((lon - LON0) / (LON1 - LON0)) * MAP_W,
  ((LAT1 - lat) / (LAT1 - LAT0)) * MAP_H,
]
export const unproj = (x: number, y: number): [number, number] => [
  LON0 + (x / MAP_W) * (LON1 - LON0),
  LAT1 - (y / MAP_H) * (LAT1 - LAT0),
]
export const nmDist = (aLon: number, aLat: number, bLon: number, bLat: number) => {
  const dx = (bLon - aLon) * 60 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180)
  const dy = (bLat - aLat) * 60
  return Math.hypot(dx, dy)
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const round1 = (v: number) => Math.round(v * 10) / 10
export const pad2 = (n: number) => String(n).padStart(2, '0')
export const clockHM = (t: number) => `${pad2(Math.floor(t / 60) % 24)}:${pad2(Math.floor(t) % 60)}`
export const clockHMS = (t: number) => `${clockHM(t)}:${pad2(Math.floor((t % 1) * 60))}`
export const fmtFL = (alt: number) => 'FL' + Math.round(alt / 100)

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)]

// ── Static geography & fleet ─────────────────────────────────────────────────
export interface Runway { id: string; hdg: number }
export interface Airport {
  code: string; icao: string; name: string; city: string
  lon: number; lat: number; weight: number; cap: number; rwys: Runway[]
}
export const AIRPORTS: Airport[] = [
  { code: 'LOS', icao: 'DNMM', name: 'Murtala Muhammed Intl', city: 'Lagos', lon: 3.321, lat: 6.577, weight: 10, cap: 30, rwys: [{ id: '18L', hdg: 181 }, { id: '36R', hdg: 1 }, { id: '18R', hdg: 181 }, { id: '36L', hdg: 1 }] },
  { code: 'ABV', icao: 'DNAA', name: 'Nnamdi Azikiwe Intl', city: 'Abuja', lon: 7.263, lat: 9.007, weight: 8, cap: 24, rwys: [{ id: '04', hdg: 40 }, { id: '22', hdg: 220 }] },
  { code: 'PHC', icao: 'DNPO', name: 'Port Harcourt Intl', city: 'Port Harcourt', lon: 6.949, lat: 5.015, weight: 5, cap: 16, rwys: [{ id: '03', hdg: 30 }, { id: '21', hdg: 210 }] },
  { code: 'KAN', icao: 'DNKN', name: 'Mallam Aminu Kano Intl', city: 'Kano', lon: 8.524, lat: 12.047, weight: 4, cap: 14, rwys: [{ id: '05', hdg: 50 }, { id: '23', hdg: 230 }] },
  { code: 'ENU', icao: 'DNEN', name: 'Akanu Ibiam Intl', city: 'Enugu', lon: 7.562, lat: 6.474, weight: 2.5, cap: 10, rwys: [{ id: '08', hdg: 80 }, { id: '26', hdg: 260 }] },
  { code: 'CAL', icao: 'DNCA', name: 'Margaret Ekpo Intl', city: 'Calabar', lon: 8.347, lat: 4.976, weight: 2, cap: 8, rwys: [{ id: '03', hdg: 30 }, { id: '21', hdg: 210 }] },
  { code: 'KAD', icao: 'DNKA', name: 'Kaduna Intl', city: 'Kaduna', lon: 7.32, lat: 10.696, weight: 1.5, cap: 8, rwys: [{ id: '05', hdg: 50 }, { id: '23', hdg: 230 }] },
  { code: 'BEN', icao: 'DNBE', name: 'Benin Airport', city: 'Benin City', lon: 5.599, lat: 6.317, weight: 1.5, cap: 8, rwys: [{ id: '05', hdg: 50 }, { id: '23', hdg: 230 }] },
  { code: 'JOS', icao: 'DNJO', name: 'Yakubu Gowon Airport', city: 'Jos', lon: 8.869, lat: 9.64, weight: 1, cap: 6, rwys: [{ id: '04', hdg: 40 }, { id: '22', hdg: 220 }] },
  { code: 'ILR', icao: 'DNIL', name: 'Ilorin Intl', city: 'Ilorin', lon: 4.494, lat: 8.44, weight: 1, cap: 6, rwys: [{ id: '05', hdg: 50 }, { id: '23', hdg: 230 }] },
  { code: 'SKO', icao: 'DNSO', name: 'Sadiq Abubakar III Intl', city: 'Sokoto', lon: 5.207, lat: 12.916, weight: 0.8, cap: 6, rwys: [{ id: '08', hdg: 80 }, { id: '26', hdg: 260 }] },
  { code: 'MIU', icao: 'DNMA', name: 'Maiduguri Intl', city: 'Maiduguri', lon: 13.081, lat: 11.855, weight: 0.8, cap: 6, rwys: [{ id: '16', hdg: 160 }, { id: '34', hdg: 340 }] },
]
export const AP: Record<string, Airport> = Object.fromEntries(AIRPORTS.map(a => [a.code, a]))
const TOTAL_W = AIRPORTS.reduce((s, a) => s + a.weight, 0)
function weightedAirport(rng: () => number): Airport {
  let r = rng() * TOTAL_W
  for (const a of AIRPORTS) { r -= a.weight; if (r <= 0) return a }
  return AIRPORTS[0]
}

export const AIRLINES = [
  { name: 'Air Peace', code: 'APK', color: '#37e08b' },
  { name: 'Ibom Air', code: 'IAN', color: '#39c8f5' },
  { name: 'Arik Air', code: 'ARA', color: '#ffb020' },
  { name: 'United Nigeria', code: 'UNN', color: '#c95cff' },
  { name: 'Green Africa', code: 'GWV', color: '#a3e635' },
  { name: 'ValueJet', code: 'VJT', color: '#ff8a3d' },
  { name: 'Aero Contractors', code: 'NIG', color: '#5ea0ff' },
  { name: 'Max Air', code: 'MXJ', color: '#e2a86b' },
  { name: 'Allied Air', code: 'AJK', color: '#9aa7ff' },
]
const TYPES = [
  { id: 'B738', cruise: 455 }, { id: 'B735', cruise: 440 }, { id: 'A320', cruise: 450 },
  { id: 'E195', cruise: 445 }, { id: 'E145', cruise: 420 }, { id: 'CRJ9', cruise: 440 },
  { id: 'AT72', cruise: 265 }, { id: 'D328', cruise: 295 },
]
export const ROUTES: [string, string][] = [
  ['LOS', 'ABV'], ['LOS', 'PHC'], ['LOS', 'KAN'], ['ABV', 'PHC'], ['ABV', 'KAN'],
  ['LOS', 'ENU'], ['LOS', 'CAL'], ['ABV', 'ENU'], ['LOS', 'BEN'], ['ABV', 'KAD'],
  ['LOS', 'JOS'], ['PHC', 'ENU'], ['KAN', 'SKO'], ['ABV', 'MIU'],
]

// Illustrative Nigeria FIR boundary (lon/lat vertices — simplified silhouette)
export const NIGERIA: [number, number][] = [
  [2.68, 6.38], [2.72, 7.1], [2.74, 7.85], [2.68, 8.6], [2.78, 9.1], [3.3, 9.65],
  [3.55, 10.3], [3.48, 11.05], [3.68, 11.72], [4.15, 12.1], [4.45, 12.75], [4.9, 13.35],
  [5.55, 13.75], [6.35, 13.6], [7.05, 13.35], [7.8, 13.85], [8.45, 13.35], [9.2, 12.9],
  [9.95, 13.2], [10.7, 13.35], [11.5, 13.4], [12.3, 13.15], [13.1, 13.35], [13.65, 13.7],
  [14.2, 13.1], [14.65, 12.75], [14.55, 12.1], [14.2, 11.55], [13.6, 10.9], [13.25, 10.2],
  [12.8, 9.4], [12.55, 8.75], [12.2, 8.1], [11.85, 7.35], [11.4, 6.7], [10.95, 6.55],
  [10.55, 6.95], [10.15, 6.55], [9.6, 6.3], [9.05, 5.95], [8.85, 5.35], [8.55, 4.75],
  [8.2, 4.55], [7.6, 4.35], [7.05, 4.3], [6.55, 4.32], [6.05, 4.28], [5.55, 4.6],
  [5.1, 5.15], [4.75, 5.7], [4.3, 6.05], [3.7, 6.3], [3.3, 6.42],
]

// ── Types ────────────────────────────────────────────────────────────────────
export interface Vec { lon: number; lat: number }
export type Phase = 'CLIMB' | 'CRUISE' | 'DESCENT' | 'HELD' | 'LANDED'
export interface Flight {
  id: number; callsign: string; airline: string; airlineColor: string; type: string; cruise: number
  originCode: string; destCode: string; from: Vec; to: Vec
  progress: number; durationMin: number; maxAlt: number; bow: number; squawk: string
  delay: number; holdUntil: number; rerouted: boolean; diverted: boolean; wx: boolean
  x: number; y: number; hdg: number; lon: number; lat: number; alt: number; gs: number; eta: number
  phase: Phase; landedAt: number; trail: [number, number][]; lastTrail: number; divertChecked: boolean
}
export interface Cell {
  id: number; lon: number; lat: number; r: number; sev: 1 | 2 | 3
  vx: number; vy: number; born: number; life: number; tops: number
}
export type AdvType = 'METER' | 'CONVECTIVE' | 'RUNWAY' | 'LVP' | 'BRIEF'
export type AdvStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export interface Advisory {
  id: number; key: string; type: AdvType; sev: 'info' | 'caution' | 'warning'
  code: string; title: string; body: string; conf: number; at: number; status: AdvStatus
  payload?: { rec?: string; cellId?: number }
}
export interface SimEvent { at: number; text: string; kind: 'wx' | 'ops' | 'ai' | 'sys' }
export interface Decision { id: number; at: number; action: string; text: string }
export interface Layers { weather: boolean; routes: boolean; trails: boolean; labels: boolean }
export interface Settings {
  speed: number; density: number; harmattan: number; storms: number
  windDir: number; windKt: number; layers: Layers
}
export interface Scenario {
  key: string; label: string; start: number
  density: number; harmattan: number; storms: number; windDir: number; windKt: number
}
export interface AirportState { activeRunway: string; meterUntil: number; lvpAck: number }
export interface World {
  seed: number; rng: () => number; t: number; day: number; paused: boolean
  settings: Settings; flights: Flight[]; cells: Cell[]
  airports: Record<string, AirportState>
  advisories: Advisory[]; events: SimEvent[]; decisions: Decision[]
  counters: { arrived: number; departed: number; diverted: number }
  history: { t: number; v: number }[]
  acc: { spawn: number; cell: number; adv: number; hist: number; wind: number }
  nextId: number; nextAdv: number; nextCell: number; cooldown: Record<string, number>
}
export type Sel = { kind: 'flight'; id: number } | { kind: 'airport'; id: string } | null

export const SCENARIOS: Record<string, Scenario> = {
  rush: { key: 'rush', label: 'Evening Rush', start: 16.0, density: 66, harmattan: 35, storms: 42, windDir: 210, windKt: 12 },
  calm: { key: 'calm', label: 'Calm Morning', start: 8.2, density: 42, harmattan: 10, storms: 12, windDir: 190, windKt: 8 },
  harmattan: { key: 'harmattan', label: 'Harmattan Front', start: 9.5, density: 58, harmattan: 92, storms: 6, windDir: 35, windKt: 18 },
  squall: { key: 'squall', label: 'Squall Line', start: 17.4, density: 72, harmattan: 15, storms: 88, windDir: 245, windKt: 22 },
}

// ── Weather helpers ──────────────────────────────────────────────────────────
export const cellEnv = (c: Cell, t: number) => Math.sin(Math.PI * clamp((t - c.born) / c.life, 0, 1))
export const effR = (c: Cell, t: number) => c.r * (0.55 + 0.45 * cellEnv(c, t))
export function visAt(w: World, a: Airport): number {
  const nf = clamp((a.lat - 7.5) / 4.5, 0, 1)
  return Math.round(9999 - (w.settings.harmattan / 100) * 9300 * Math.max(nf, 0.12))
}
export function bestRunway(dir: number, rwys: Runway[]): string {
  let best = rwys[0], bd = 999
  for (const r of rwys) {
    const d = Math.abs(((dir - r.hdg + 540) % 360) - 180)
    const diff = 180 - d
    if (diff < bd) { bd = diff; best = r }
  }
  return best.id
}
const diurnal = (h: number) => (h >= 7 && h <= 10 ? 1.25 : h >= 16 && h <= 19 ? 1.35 : h >= 11 && h <= 15 ? 1 : 0.55)

export interface FieldStats {
  vis: number; cap: number; demand: number; rec: string; metering: boolean; lvp: boolean
  storm: boolean; stormSev: number; stormDist: number; stormTops: number; activeRunway: string; wx: boolean
}
export function fieldStats(w: World, code: string): FieldStats {
  const a = AP[code], st = w.airports[code]
  const vis = visAt(w, a)
  let stormF = 1, nearest = Infinity, sev = 0, tops = 0
  for (const c of w.cells) {
    const d = nmDist(a.lon, a.lat, c.lon, c.lat)
    if (d < effR(c, w.t) + 15) {
      stormF = Math.min(stormF, c.sev === 3 ? 0.45 : c.sev === 2 ? 0.62 : 0.8)
      if (d < nearest) { nearest = d; sev = c.sev; tops = c.tops }
    }
  }
  const visF = vis < 1200 ? 0.45 : vis < 2000 ? 0.6 : vis < 4000 ? 0.78 : vis < 6000 ? 0.9 : 1
  const cap = Math.max(3, Math.round(a.cap * visF * stormF))
  const hour = Math.floor(w.t / 60) % 24
  let demand = Math.round(a.weight * 1.35 * diurnal(hour))
  for (const f of w.flights) if (f.destCode === code && f.phase !== 'LANDED' && f.eta - w.t <= 60) demand++
  const metering = st.meterUntil > w.t
  if (metering) demand = Math.min(demand, cap)
  return {
    vis, cap, demand, rec: bestRunway(w.settings.windDir, a.rwys), metering,
    lvp: st.lvpAck > w.t, storm: stormF < 1, stormSev: sev, stormDist: nearest,
    stormTops: tops, activeRunway: st.activeRunway, wx: vis < 5000 || stormF < 1,
  }
}

// ── World creation ───────────────────────────────────────────────────────────
function event(w: World, text: string, kind: SimEvent['kind']) {
  w.events.unshift({ at: w.t, text, kind })
  if (w.events.length > 12) w.events.pop()
}
function spawnCell(w: World, aged = false) {
  const s = w.rng()
  w.cells.push({
    id: w.nextCell++, lon: 3 + w.rng() * 10.5, lat: 4.4 + w.rng() * 6.2,
    r: 16 + w.rng() * 26, sev: s < 0.45 ? 1 : s < 0.85 ? 2 : 3,
    vx: -(0.25 + w.rng() * 0.3), vy: (w.rng() - 0.5) * 0.12,
    born: aged ? w.t - w.rng() * 40 : w.t, life: 50 + w.rng() * 80,
    tops: 330 + Math.round(w.rng() * 12) * 10,
  })
}
function updateFlight(w: World, f: Flight, dt: number) {
  if (f.phase === 'LANDED') return
  const held = w.t < f.holdUntil
  if (!held) f.progress = Math.min(1, f.progress + dt / f.durationMin)
  const [x0, y0] = proj(f.from.lon, f.from.lat)
  const [x1, y1] = proj(f.to.lon, f.to.lat)
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1
  const cx = (x0 + x1) / 2 - (dy / len) * f.bow
  const cy = (y0 + y1) / 2 + (dx / len) * f.bow
  const quad = (t: number): [number, number] => {
    const q = 1 - t
    return [q * q * x0 + 2 * q * t * cx + t * t * x1, q * q * y0 + 2 * q * t * cy + t * t * y1]
  }
  const p = f.progress
  ;[f.x, f.y] = quad(p)
  const tx = 2 * (1 - p) * (cx - x0) + 2 * p * (x1 - cx)
  const ty = 2 * (1 - p) * (cy - y0) + 2 * p * (y1 - cy)
  f.hdg = (Math.atan2(ty, tx) * 180) / Math.PI + 90
  ;[f.lon, f.lat] = unproj(f.x, f.y)
  const prof = Math.min(1, p / 0.16, (1 - p) / 0.2)
  f.alt = Math.max(1200, Math.round((f.maxAlt * (0.25 + 0.75 * prof)) / 100) * 100)
  f.gs = Math.round(f.cruise * (held ? 0.6 : 0.55 + 0.45 * prof))
  f.phase = held ? 'HELD' : p < 0.16 ? 'CLIMB' : p > 0.8 ? 'DESCENT' : 'CRUISE'
  f.eta = w.t + (1 - p) * f.durationMin + Math.max(0, f.holdUntil - w.t)
  f.wx = false
  const [llx, lly] = quad(Math.min(1, p + 0.12))
  const [llon, llat] = unproj(llx, lly)
  for (const c of w.cells) {
    const R = effR(c, w.t) + 16
    if (nmDist(f.lon, f.lat, c.lon, c.lat) < R || nmDist(llon, llat, c.lon, c.lat) < R) { f.wx = true; break }
  }
  if (w.t - f.lastTrail > 1.6) {
    f.trail.push([f.x, f.y])
    if (f.trail.length > 9) f.trail.shift()
    f.lastTrail = w.t
  }
}
function makeFlight(w: World, airborne: boolean): Flight {
  const o = weightedAirport(w.rng)
  let d = weightedAirport(w.rng), guard = 0
  while (d.code === o.code && guard++ < 8) d = weightedAirport(w.rng)
  if (d.code === o.code) d = AIRPORTS[(AIRPORTS.indexOf(o) + 1) % AIRPORTS.length]
  const al = pick(w.rng, AIRLINES), ty = pick(w.rng, TYPES)
  const dist = nmDist(o.lon, o.lat, d.lon, d.lat)
  const f: Flight = {
    id: w.nextId++, callsign: al.code + (100 + Math.floor(w.rng() * 860)),
    airline: al.name, airlineColor: al.color, type: ty.id, cruise: ty.cruise,
    originCode: o.code, destCode: d.code, from: { lon: o.lon, lat: o.lat }, to: { lon: d.lon, lat: d.lat },
    progress: airborne ? 0.05 + w.rng() * 0.8 : 0,
    durationMin: (dist / ty.cruise) * 60 + 11,
    maxAlt: Math.min(37000, Math.max(16000, Math.round((9000 + dist * 70) / 1000) * 1000)),
    bow: (w.rng() - 0.5) * 26,
    squawk: Array.from({ length: 4 }, () => Math.floor(w.rng() * 8)).join(''),
    delay: w.rng() < 0.5 ? 0 : Math.round(w.rng() * (8 + (w.settings.storms + w.settings.harmattan) / 6)),
    holdUntil: 0, rerouted: false, diverted: false, wx: false,
    x: 0, y: 0, hdg: 0, lon: o.lon, lat: o.lat, alt: 0, gs: 0, eta: 0,
    phase: 'CLIMB', landedAt: 0, trail: [], lastTrail: 0, divertChecked: false,
  }
  updateFlight(w, f, 0)
  return f
}
export function createWorld(sc: Scenario, seed?: number): World {
  const sd = seed ?? Math.floor(Math.random() * 1e9)
  const rng = mulberry32(sd)
  const w: World = {
    seed: sd, rng, t: sc.start * 60, day: 1, paused: false,
    settings: {
      speed: 1, density: sc.density, harmattan: sc.harmattan, storms: sc.storms,
      windDir: sc.windDir, windKt: sc.windKt,
      layers: { weather: true, routes: true, trails: true, labels: true },
    },
    flights: [], cells: [], airports: {}, advisories: [], events: [], decisions: [],
    counters: { arrived: Math.round(sc.start * 7.4), departed: 0, diverted: 0 },
    history: [], acc: { spawn: 0, cell: 0, adv: 0, hist: 0, wind: 0 },
    nextId: 1, nextAdv: 1, nextCell: 1, cooldown: {},
  }
  for (const a of AIRPORTS) w.airports[a.code] = { activeRunway: bestRunway(sc.windDir, a.rwys), meterUntil: 0, lvpAck: 0 }
  const nC = Math.round(sc.storms / 16)
  for (let i = 0; i < nC; i++) spawnCell(w, true)
  const nF = 18 + Math.round(sc.density / 7)
  for (let i = 0; i < nF; i++) w.flights.push(makeFlight(w, true))
  w.counters.departed = w.counters.arrived + nF
  for (let i = 14; i > 0; i--) w.history.push({ t: w.t - i * 5, v: round1(4 + rng() * 7 + (sc.storms + sc.harmattan) / 22) })
  event(w, `Shadow session initialised — ${sc.label}`, 'sys')
  const briefBody =
    sc.storms > 60 ? 'Convective SIGMET active across the southern FIR. Expect approach disruption, vectors and possible diversions into LOS/ABV.'
    : sc.harmattan > 60 ? 'Dense harmattan haze north of 9°N. Visibility below LVP minima likely at SKO/KAN/MIU — reduced arrival rates.'
    : 'Traffic steady. Evening demand peak expected 17:00–19:00 WAT at LOS/ABV. Monitor flow against weather-adjusted capacity.'
  w.advisories.push({
    id: w.nextAdv++, key: 'BRIEF', type: 'BRIEF', sev: 'info', code: 'LOS',
    title: `Operational brief — ${sc.label}`, body: briefBody, conf: 92, at: w.t, status: 'pending',
  })
  evaluateAdvisories(w)
  return w
}

// ── Advisory engine ──────────────────────────────────────────────────────────
function tryPush(w: World, a: Omit<Advisory, 'id' | 'at' | 'status'>, cond: boolean, baseConf: number) {
  if (!cond) return
  if (w.advisories.filter(x => x.status === 'pending').length >= 7) return
  if (w.advisories.some(x => x.status === 'pending' && x.key === a.key)) return
  const last = w.cooldown[a.key]
  if (last !== undefined && w.t - last < 18) return
  w.cooldown[a.key] = w.t
  const adv: Advisory = { ...a, id: w.nextAdv++, at: w.t, status: 'pending', conf: Math.min(97, baseConf + Math.round(w.rng() * 8)) }
  w.advisories.unshift(adv)
  event(w, `AI advisory: ${adv.title}`, 'ai')
}
export function evaluateAdvisories(w: World) {
  for (const a of AIRPORTS.filter(x => x.weight >= 3.5)) {
    const st = fieldStats(w, a.code)
    tryPush(w, {
      key: 'METER' + a.code, type: 'METER', sev: st.demand > st.cap * 1.35 ? 'warning' : 'caution', code: a.code,
      title: `Flow metering — ${a.code}`,
      body: `Projected ${st.demand} arrivals/hr against ${st.cap}/hr weather-adjusted capacity. Suggest ground holds or +2 min final spacing for ${Math.max(1, st.demand - st.cap)} aircraft.`,
      conf: 0,
    }, st.demand > st.cap * 1.08, 82)
    tryPush(w, {
      key: 'CONV' + a.code, type: 'CONVECTIVE', sev: 'warning', code: a.code,
      title: `Convective cell — ${a.code}`,
      body: `CB activity ${Math.round(st.stormDist)} NM from the field, tops FL${st.stormTops}. Expect approach disruption; vector arrivals around the cell and review alternate fuel.`,
      conf: 0, payload: {},
    }, st.storm && st.stormSev >= 2, 86)
    tryPush(w, {
      key: 'RWY' + a.code, type: 'RUNWAY', sev: 'info', code: a.code,
      title: `Runway change — ${a.code}`,
      body: `Surface wind ${Math.round(w.settings.windDir)}°/${Math.round(w.settings.windKt)} kt favours RWY ${st.rec} (currently ${st.activeRunway}). Coordinate change with tower.`,
      conf: 0, payload: { rec: st.rec },
    }, st.rec !== st.activeRunway && w.settings.windKt >= 8, 90)
    tryPush(w, {
      key: 'LVP' + a.code, type: 'LVP', sev: 'caution', code: a.code,
      title: `Low visibility procedures — ${a.code}`,
      body: `Harmattan haze reduces visibility to ${st.vis} m. Activate LVP; expect reduced arrival rate and increased spacing.`,
      conf: 0,
    }, st.vis < 1500 && !st.lvp, 88)
  }
}

// ── Tick ─────────────────────────────────────────────────────────────────────
export function tick(w: World, dt: number) {
  w.t += dt
  if (w.t >= 1440) { w.t -= 1440; w.day++ }
  w.acc.wind += dt
  if (w.acc.wind > 12) {
    w.acc.wind = 0
    w.settings.windDir = (w.settings.windDir + (w.rng() - 0.5) * 10 + 360) % 360
    w.settings.windKt = clamp(w.settings.windKt + (w.rng() - 0.5) * 2, 4, 30)
  }
  for (const c of w.cells) { c.lon += (c.vx * dt) / 60; c.lat += (c.vy * dt) / 60 }
  w.cells = w.cells.filter(c => w.t - c.born < c.life && c.lon > 1.5)
  w.acc.cell += dt
  if (w.acc.cell > lerp(34, 3.5, w.settings.storms / 100)) {
    w.acc.cell = 0
    if (w.settings.storms > 3 && w.cells.length < 11 && w.rng() < 0.25 + w.settings.storms / 130) spawnCell(w)
  }
  for (const f of w.flights) {
    updateFlight(w, f, dt)
    if (f.progress >= 1 && f.phase !== 'LANDED') {
      f.phase = 'LANDED'; f.landedAt = w.t; w.counters.arrived++
      event(w, `${f.callsign} landed ${f.destCode}${f.diverted ? ' (diverted)' : ''}`, 'ops')
      continue
    }
    if (!f.divertChecked && f.progress > 0.78 && f.phase !== 'LANDED') {
      f.divertChecked = true
      const dest = AP[f.destCode]
      const threat = w.cells.find(c => c.sev === 3 && nmDist(dest.lon, dest.lat, c.lon, c.lat) < effR(c, w.t) + 12)
      if (threat && w.rng() < 0.8) {
        const alts = AIRPORTS.filter(x => x.weight >= 2 && x.code !== f.destCode &&
          !w.cells.some(c => c.sev === 3 && nmDist(x.lon, x.lat, c.lon, c.lat) < effR(c, w.t) + 12))
        if (alts.length) {
          alts.sort((x, y) => nmDist(f.lon, f.lat, x.lon, x.lat) - nmDist(f.lon, f.lat, y.lon, y.lat))
          const alt = alts[0]
          f.from = { lon: f.lon, lat: f.lat }; f.to = { lon: alt.lon, lat: alt.lat }
          f.destCode = alt.code; f.diverted = true; f.progress = 0.02
          f.durationMin = (nmDist(f.lon, f.lat, alt.lon, alt.lat) / f.cruise) * 60 + 9
          f.bow = (w.rng() - 0.5) * 18; f.delay += 14; f.trail = []; f.holdUntil = 0
          w.counters.diverted++
          event(w, `${f.callsign} diverting to ${alt.code} — CB over ${dest.code}`, 'wx')
        }
      }
    }
  }
  w.flights = w.flights.filter(f => f.phase !== 'LANDED' || w.t - f.landedAt < 2.5)
  w.acc.spawn += dt
  if (w.acc.spawn > lerp(5, 0.55, w.settings.density / 100)) {
    w.acc.spawn = 0
    if (w.flights.filter(f => f.phase !== 'LANDED').length < 44) {
      w.flights.push(makeFlight(w, false)); w.counters.departed++
    }
  }
  w.acc.adv += dt
  if (w.acc.adv > 45) { w.acc.adv = 0; evaluateAdvisories(w) }
  for (const a of w.advisories) {
    if (a.status === 'pending' && w.t - a.at > 26 && a.type !== 'BRIEF') {
      a.status = 'expired'; event(w, `Advisory expired — ${a.title}`, 'ai')
    }
  }
  w.acc.hist += dt
  if (w.acc.hist > 5) {
    w.acc.hist = 0
    const air = w.flights.filter(f => f.phase !== 'LANDED')
    const avg = air.length ? air.reduce((s, f) => s + f.delay, 0) / air.length : 0
    w.history.push({ t: w.t, v: round1(avg) })
    if (w.history.length > 36) w.history.shift()
  }
}

// ── Human-in-the-loop decisions & commands (with undo) ───────────────────────
export function applyDecision(w: World, id: number, accept: boolean): { label: string; undo: () => void } | null {
  const a = w.advisories.find(x => x.id === id)
  if (!a || a.status !== 'pending') return null
  a.status = accept ? 'accepted' : 'rejected'
  w.decisions.unshift({ id: w.nextId++, at: w.t, action: accept ? 'ACCEPTED' : 'DISMISSED', text: a.title })
  if (w.decisions.length > 30) w.decisions.pop()
  const ud: { meter?: number; ids?: number[]; rwy?: string; vec?: { id: number; bow: number; rr: boolean }[]; lvp?: number } = {}
  if (accept) {
    const st = w.airports[a.code]
    if (a.type === 'METER' && st) {
      ud.meter = st.meterUntil; st.meterUntil = w.t + 30; ud.ids = []
      for (const f of w.flights) if (f.destCode === a.code && f.phase !== 'LANDED' && f.progress < 0.92) { f.delay += 4; ud.ids.push(f.id) }
      event(w, `Metering active ${a.code} until ${clockHM(w.t + 30)} WAT`, 'ops')
    } else if (a.type === 'RUNWAY' && st && a.payload?.rec) {
      ud.rwy = st.activeRunway; st.activeRunway = a.payload.rec
      event(w, `${a.code} runway changed to ${a.payload.rec}`, 'ops')
    } else if (a.type === 'CONVECTIVE') {
      ud.vec = []
      for (const f of w.flights) if (f.destCode === a.code && f.phase !== 'LANDED' && f.progress < 0.95) {
        ud.vec.push({ id: f.id, bow: f.bow, rr: f.rerouted })
        f.bow = (f.bow >= 0 ? 1 : -1) * 72; f.rerouted = true
      }
      event(w, `Vectors issued around CB — ${a.code} arrivals`, 'ops')
    } else if (a.type === 'LVP' && st) {
      ud.lvp = st.lvpAck; st.lvpAck = w.t + 45
      event(w, `LVP activated ${a.code}`, 'ops')
    } else if (a.type === 'BRIEF') {
      event(w, 'Operational brief acknowledged by supervisor', 'sys')
    }
  }
  const label = accept ? `Accepted — ${a.title}` : `Dismissed — ${a.title}`
  const undo = () => {
    a.status = 'pending'
    w.decisions.unshift({ id: w.nextId++, at: w.t, action: 'REVERTED', text: a.title })
    const st = w.airports[a.code]
    if (ud.meter !== undefined && st) st.meterUntil = ud.meter
    if (ud.ids) for (const f of w.flights) if (ud.ids.includes(f.id)) f.delay = Math.max(0, f.delay - 4)
    if (ud.rwy !== undefined && st) st.activeRunway = ud.rwy
    if (ud.vec) for (const v of ud.vec) { const f = w.flights.find(x => x.id === v.id); if (f) { f.bow = v.bow; f.rerouted = v.rr } }
    if (ud.lvp !== undefined && st) st.lvpAck = ud.lvp
  }
  return { label, undo }
}
export function flightCommand(w: World, id: number, cmd: 'vector' | 'hold' | 'clear'): { label: string; undo: () => void } | null {
  const f = w.flights.find(x => x.id === id)
  if (!f || f.phase === 'LANDED') return null
  const prev = { bow: f.bow, rr: f.rerouted, hold: f.holdUntil, delay: f.delay }
  let label = ''
  if (cmd === 'vector') { f.bow = (f.bow >= 0 ? 1 : -1) * 72; f.rerouted = true; label = `${f.callsign} vectored around weather` }
  if (cmd === 'hold') { f.holdUntil = Math.max(f.holdUntil, w.t) + 5; f.delay += 5; label = `${f.callsign} holding +5 min` }
  if (cmd === 'clear') { f.holdUntil = 0; f.rerouted = false; f.bow = (w.rng() - 0.5) * 20; label = `${f.callsign} resumed own navigation` }
  event(w, label, 'ops')
  w.decisions.unshift({ id: w.nextId++, at: w.t, action: 'COMMAND', text: label })
  if (w.decisions.length > 30) w.decisions.pop()
  const undo = () => {
    const g = w.flights.find(x => x.id === id)
    if (!g) return
    g.bow = prev.bow; g.rerouted = prev.rr; g.holdUntil = prev.hold; g.delay = prev.delay
    w.decisions.unshift({ id: w.nextId++, at: w.t, action: 'REVERTED', text: label })
  }
  return { label, undo }
}

// ── Forecast & snapshot ──────────────────────────────────────────────────────
export interface Bucket { label: string; demand: number; capacity: number; over: boolean }
export function forecast(w: World, code: string): Bucket[] {
  const a = AP[code], st = fieldStats(w, code)
  const visF = st.vis < 1200 ? 0.45 : st.vis < 2000 ? 0.6 : st.vis < 4000 ? 0.78 : st.vis < 6000 ? 0.9 : 1
  const nowStormF = st.storm ? st.cap / (a.cap * visF) : 1
  const out: Bucket[] = []
  for (let i = 0; i < 6; i++) {
    const tt = w.t + i * 60, hour = Math.floor(tt / 60) % 24
    let dem = Math.round(a.weight * 1.35 * diurnal(hour))
    for (const f of w.flights) if (f.destCode === code && f.phase !== 'LANDED' && f.eta >= tt && f.eta < tt + 60) dem++
    const cap = Math.max(3, Math.round(a.cap * visF * Math.min(1, nowStormF + i * 0.07)))
    if (w.airports[code].meterUntil > tt) dem = Math.min(dem, cap)
    out.push({ label: pad2(hour) + ':00', demand: dem, capacity: cap, over: dem > cap })
  }
  return out
}
export interface SnapAirport extends Airport, FieldStats {}
export interface Snap {
  t: number; day: number
  kpis: { airborne: number; movements: number; avgDelay: number; wxFields: number; pending: number; load: number; diverted: number }
  flights: Flight[]; airports: SnapAirport[]
  cells: (Cell & { effR: number; env: number })[]
  advisories: Advisory[]; events: SimEvent[]; decisions: Decision[]
  history: { t: number; v: number }[]; forecast: Bucket[]; hub: string
}
export function makeSnapshot(w: World, hub: string): Snap {
  const flights = w.flights.map(f => ({ ...f }))
  const airports: SnapAirport[] = AIRPORTS.map(a => ({ ...a, ...fieldStats(w, a.code) }))
  const majors = airports.filter(a => a.weight >= 3.5)
  const airborne = flights.filter(f => f.phase !== 'LANDED')
  const avgDelay = airborne.length ? round1(airborne.reduce((s, f) => s + f.delay, 0) / airborne.length) : 0
  const load = Math.round((majors.reduce((s, a) => s + a.demand, 0) / majors.reduce((s, a) => s + a.cap, 0)) * 100) / 100
  return {
    t: w.t, day: w.day,
    kpis: {
      airborne: airborne.length, movements: w.counters.arrived + w.counters.departed,
      avgDelay, wxFields: airports.filter(a => a.wx).length,
      pending: w.advisories.filter(a => a.status === 'pending').length,
      load, diverted: w.counters.diverted,
    },
    flights, airports,
    cells: w.cells.map(c => ({ ...c, effR: effR(c, w.t), env: cellEnv(c, w.t) })),
    advisories: w.advisories.map(a => ({ ...a })),
    events: [...w.events], decisions: [...w.decisions],
    history: [...w.history], forecast: forecast(w, hub), hub,
  }
}
export function flightStatus(f: Flight): string {
  if (f.phase === 'LANDED') return 'LANDED'
  if (f.phase === 'HELD') return 'HELD'
  if (f.diverted) return 'DIVERTED'
  if (f.wx) return 'WX RISK'
  if (f.delay >= 8) return 'DELAYED'
  return f.phase
}
export const STATUS_TONE: Record<string, string> = {
  CLIMB: 'ok', CRUISE: 'ok', DESCENT: 'ok', DELAYED: 'warn', 'WX RISK': 'storm',
  DIVERTED: 'bad', HELD: 'cyan', LANDED: 'dim',
}