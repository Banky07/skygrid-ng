// ─────────────────────────────────────────────────────────────────────────────
// SkyGrid NG · live weather. Parses decoded METAR JSON from the NOAA
// AviationWeather Data API (via our /api/metar proxy) into what the rules need.
// Visibility, wind, cloud and weather groups are read from the raw METAR text
// because the JSON visibility field is capped ("6+" statute miles).
// ─────────────────────────────────────────────────────────────────────────────

export const LIVE_FIELDS: Record<string, string> = { DNMM: 'LOS', DNAA: 'ABV' }
export const LIVE_CODES = new Set(Object.values(LIVE_FIELDS))

export interface LiveWx {
  icao: string; code: string; obsMs: number
  windDir: number | null; windKt: number; gustKt: number | null
  visM: number; ceilingFt: number | null
  ts: boolean; cb: boolean; wx: string[]
  fltCat: string; raw: string
}
export interface LiveState {
  data: Record<string, LiveWx>; fetchedAt: number | null; error: string | null
}

const TREND = new Set(['NOSIG', 'BECMG', 'TEMPO', 'RMK'])
const WIND_RE = /^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/
const CLOUD_RE = /^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/
const WX_RE = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)*(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*$/

// rec is one element of the AviationWeather METAR JSON array.
export function parseMetar(rec: any): LiveWx | null {
  const icao = String(rec?.icaoId ?? '')
  const code = LIVE_FIELDS[icao]
  const raw = String(rec?.rawOb ?? '').trim()
  if (!code || !raw || typeof rec?.obsTime !== 'number') return null

  const all = raw.split(/\s+/)
  const cut = all.findIndex(t => TREND.has(t))
  const toks = cut >= 0 ? all.slice(0, cut) : all   // current conditions only, not trend groups

  let windDir: number | null = typeof rec.wdir === 'number' ? rec.wdir : null
  let windKt = Number(rec.wspd) || 0
  let gustKt: number | null = null
  let visM: number | null = null
  let ceilingFt: number | null = null
  let ts = false, cb = false
  const wx: string[] = []

  for (const t of toks) {
    let m: RegExpMatchArray | null
    if ((m = t.match(WIND_RE))) {
      const f = m[4] === 'MPS' ? 1.944 : 1
      windDir = m[1] === 'VRB' ? null : Number(m[1])
      windKt = Math.round(Number(m[2]) * f)
      gustKt = m[3] ? Math.round(Number(m[3]) * f) : null
    } else if (t === 'CAVOK') {
      visM = 10000
    } else if (/^\d{4}$/.test(t) && visM === null) {
      visM = Number(t) >= 9999 ? 10000 : Number(t)
    } else if ((m = t.match(CLOUD_RE))) {
      if (m[3]) cb = true
      if (m[1] === 'BKN' || m[1] === 'OVC' || m[1] === 'VV') {
        const ft = Number(m[2]) * 100
        ceilingFt = ceilingFt === null ? ft : Math.min(ceilingFt, ft)
      }
    } else if (t.length >= 2 && WX_RE.test(t)) {
      wx.push(t)
      if (t.includes('TS')) ts = true
    }
  }

  if (visM === null) {
    const v = rec.visib
    if (typeof v === 'number') visM = Math.round(v * 1609.34)
    else visM = 10000   // "6+" style value, or missing: treat as unrestricted
  }
  return {
    icao, code, obsMs: rec.obsTime * 1000, windDir, windKt, gustKt,
    visM, ceilingFt, ts, cb, wx, fltCat: String(rec.fltCat ?? ''), raw,
  }
}

// Whole API response -> keyed by airport code (LOS, ABV). Ignores stations we do not use.
export function parseMetars(json: unknown): Record<string, LiveWx> {
  const out: Record<string, LiveWx> = {}
  if (!Array.isArray(json)) return out
  for (const rec of json) {
    const wx = parseMetar(rec)
    if (wx && (!out[wx.code] || out[wx.code].obsMs < wx.obsMs)) out[wx.code] = wx
  }
  return out
}

export const ageMin = (wx: LiveWx, nowMs: number): number => Math.max(0, Math.round((nowMs - wx.obsMs) / 60000))

export function sourceLabel(wx: LiveWx): string {
  const d = new Date(wx.obsMs)
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `METAR ${wx.icao} ${hh}${mm}Z`
}

export function describeWx(wx: LiveWx): string {
  const d = new Date(wx.obsMs)
  const hhmm = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
  const dir = wx.windDir === null ? 'VRB' : String(Math.round(wx.windDir)).padStart(3, '0') + '°'
  const vis = wx.visM >= 10000 ? '10 km+' : (wx.visM / 1000).toFixed(1) + ' km'
  const ceil = wx.ceilingFt === null ? 'no ceiling' : 'ceiling ' + wx.ceilingFt + ' ft'
  return `${hhmm}Z · ${dir}/${wx.windKt} kt · vis ${vis} · ${ceil}${wx.ts ? ' · TS' : ''}${wx.cb ? ' · CB' : ''}`
}
