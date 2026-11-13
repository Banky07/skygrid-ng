// Run with: npm test   (uses npx tsx; no extra install step needed)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseMetar, parseMetars } from '../src/wx'
import { createWorld, fieldStats, evaluateAdvisories, setWeatherSource, liveFor, visAt, SCENARIOS, AIRPORTS } from '../src/sim'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/metar-2026-11-13.json', import.meta.url), 'utf8'))
const rec = (icao: string, raw: string, extra: object = {}) => ({ icaoId: icao, obsTime: Math.floor(Date.now() / 1000), rawOb: raw, ...extra })
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('  ok', name) }

// ── parsing ──────────────────────────────────────────────────────────────────
ok('real DNMM and DNAA reports (13 Nov 2026) parse', () => {
  const d = parseMetars(fixture)
  assert.deepEqual(Object.keys(d).sort(), ['ABV', 'LOS'])
  assert.equal(d.LOS.windDir, 250); assert.equal(d.LOS.windKt, 3); assert.equal(d.LOS.visM, 10000)
  assert.equal(d.LOS.ceilingFt, null); assert.equal(d.LOS.ts, false); assert.equal(d.LOS.cb, false)
  assert.equal(d.ABV.windDir, 260); assert.equal(d.ABV.windKt, 4); assert.equal(d.ABV.visM, 10000)
  assert.equal(d.LOS.obsMs, 1794564000 * 1000)
})
ok('thunderstorm, CB cloud, ceiling and reduced visibility', () => {
  const w = parseMetar(rec('DNMM', 'METAR DNMM 131000Z 25003KT 4000 TSRA SCT013CB BKN020 31/24 Q1018 NOSIG'))!
  assert.equal(w.visM, 4000); assert.equal(w.ts, true); assert.equal(w.cb, true); assert.equal(w.ceilingFt, 2000)
  assert.ok(w.wx.includes('TSRA'))
})
ok('variable wind, fog and vertical visibility', () => {
  const w = parseMetar(rec('DNAA', 'METAR DNAA 131000Z VRB02KT 0800 FG VV002 25/24 Q1018'))!
  assert.equal(w.windDir, null); assert.equal(w.visM, 800); assert.equal(w.ceilingFt, 200); assert.ok(w.wx.includes('FG'))
})
ok('gusts, haze, and wind in m/s', () => {
  const g = parseMetar(rec('DNMM', 'METAR DNMM 131000Z 36010G22KT 3000 HZ SCT020 30/20 Q1015'))!
  assert.equal(g.gustKt, 22); assert.equal(g.visM, 3000); assert.ok(g.wx.includes('HZ'))
  const m = parseMetar(rec('DNMM', 'METAR DNMM 131000Z 05005MPS 9999 NSC 30/20 Q1015'))!
  assert.equal(m.windKt, 10)
})
ok('trend groups (TEMPO, BECMG) are ignored', () => {
  const w = parseMetar(rec('DNMM', 'METAR DNMM 131000Z 25003KT 9999 SCT013 31/24 Q1018 TEMPO 2000 TSRA'))!
  assert.equal(w.ts, false); assert.equal(w.visM, 10000)
})
ok('unknown stations and malformed records are ignored', () => {
  assert.equal(parseMetar(rec('KJFK', 'METAR KJFK 131000Z 25003KT 9999')), null)
  assert.equal(parseMetar({ icaoId: 'DNMM' }), null)
  assert.deepEqual(parseMetars({ error: 'x' }), {})
})

// ── hybrid mode in the simulation ────────────────────────────────────────────
const cellAt = (id: number, code: string) => {
  const a = AIRPORTS.find(x => x.code === code)!
  return { id, lon: a.lon, lat: a.lat, r: 40, sev: 3, tops: 400, vx: 0, vy: 0, born: 0, life: 99999 } as any
}
const calm = (code: string) => {
  const w = createWorld(SCENARIOS.calm, 11)
  w.cells = [cellAt(900, 'ABV')]
  return { w, live: parseMetars(fixture) }
}
ok('live weather replaces simulated weather at LOS and ABV only', () => {
  const { w, live } = calm('ABV')
  const simStormy = fieldStats(w, 'ABV')
  assert.equal(simStormy.storm, true)                       // simulated cell sits on Abuja
  w.live = Object.fromEntries(Object.entries(live).map(([k, v]) => [k, { ...v, obsMs: Date.now() - 10 * 60000 }]))
  setWeatherSource(w, true)
  const abv = fieldStats(w, 'ABV'), los = fieldStats(w, 'LOS')
  assert.equal(abv.storm, false); assert.equal(abv.vis, 10000); assert.equal(abv.windDir, 260); assert.equal(abv.windKt, 4)
  assert.match(abv.wxSource!, /^METAR DNAA /); assert.equal(los.windDir, 250)
  const kan = fieldStats(w, 'KAN')                          // not a live field
  assert.equal(kan.wxSource, undefined); assert.equal(kan.vis, visAt(w, AIRPORTS.find(a => a.code === 'KAN')!))
})
ok('reported thunderstorm cuts capacity and raises TS-REPORTED-01 with source', () => {
  const { w } = calm('LOS')
  w.cells = []
  const base = fieldStats(w, 'LOS').cap
  w.live = { LOS: parseMetar(rec('DNMM', 'METAR DNMM 131000Z 25003KT 4000 TSRA SCT013CB 31/24 Q1018'))! }
  setWeatherSource(w, true)
  const f = fieldStats(w, 'LOS')
  assert.equal(f.tsReported, true); assert.ok(f.cap < base)
  w.advisories = []; w.cooldown = {}
  evaluateAdvisories(w)
  const a = w.advisories.find(x => x.ruleId === 'TS-REPORTED-01' && x.code === 'LOS')!
  assert.ok(a, 'advisory raised'); assert.match(String(a.inputs.source), /^METAR DNMM /)
  assert.ok(a.verifyAtAbs! - a.atAbs >= 75, 'live advisories are verified no sooner than 75 min')
})
ok('reports older than 3 hours are not used', () => {
  const { w } = calm('ABV')
  const old = parseMetar(rec('DNAA', 'METAR DNAA 131000Z 26004KT CAVOK 31/22 Q1018', { obsTime: Math.floor(Date.now() / 1000) - 4 * 3600 }))!
  w.live = { ABV: old }; setWeatherSource(w, true)
  assert.equal(liveFor(w, 'ABV'), null)
  assert.equal(fieldStats(w, 'ABV').wxSource, undefined)
  assert.equal(fieldStats(w, 'ABV').storm, true)            // falls back to the simulated cell
})
ok('switching source expires pending advisories at the live fields', () => {
  const { w } = calm('ABV')
  w.advisories = []; w.cooldown = {}
  evaluateAdvisories(w)
  assert.ok(w.advisories.some(a => a.code === 'ABV' && a.status === 'pending'), 'sim advisory at ABV exists')
  w.live = parseMetars(fixture); setWeatherSource(w, true)
  assert.ok(w.advisories.filter(a => a.code === 'ABV' && a.type !== 'BRIEF').every(a => a.status === 'expired'))
})
ok('variable wind does not change the active runway', () => {
  const { w } = calm('LOS')
  w.live = { LOS: parseMetar(rec('DNMM', 'METAR DNMM 131000Z VRB03KT 9999 SCT020 31/24 Q1018'))! }
  setWeatherSource(w, true)
  const f = fieldStats(w, 'LOS')
  assert.equal(f.windDir, null); assert.equal(f.rec, f.activeRunway)
})
console.log(`\n${n} checks passed`)
