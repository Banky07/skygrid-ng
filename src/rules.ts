// ─────────────────────────────────────────────────────────────────────────────
// SkyGrid NG · rules engine. Pure functions over plain inputs (no world state),
// so the same rules can run on simulated data, live feeds, or recorded replays.
// All thresholds live in rules.json and are versioned.
// ─────────────────────────────────────────────────────────────────────────────
import raw from './rules.json'
import type { AdvType, Advisory } from './sim'

export type Severity = 'info' | 'caution' | 'warning'
export type InputValue = number | string

export interface RuleDef {
  id: string; name: string; type: AdvType; severity: Severity
  verifyAfterMin: number | null; params: Record<string, number>; description: string
}
interface RuleConfig {
  ruleSet: string; version: string; status: string; note: string
  capacity: {
    visibilityFactors: { belowM: number; factor: number }[]
    stormFactorBySeverity: Record<string, number>
    stormBufferNm: number; tsReportedFactor: number; minCapacityPerHour: number; stormRecoveryPerHour: number
  }
  live: { staleAfterMin: number; unusableAfterMin: number; minVerifyMin: number }
  demand: {
    weightMultiplier: number; lookaheadMin: number
    diurnal: { fromHour: number; toHour: number; factor: number }[]
    offPeakFactor: number
  }
  advisories: {
    maxPending: number; cooldownMin: number; expireAfterMin: number
    majorAirportMinWeight: number; rules: RuleDef[]
  }
}
export const RULES = raw as unknown as RuleConfig

export const visFactor = (vis: number): number => {
  for (const s of RULES.capacity.visibilityFactors) if (vis < s.belowM) return s.factor
  return 1
}
export const stormFactor = (sev: number): number => RULES.capacity.stormFactorBySeverity[String(sev)] ?? 1
export const diurnalFactor = (hour: number): number => {
  for (const b of RULES.demand.diurnal) if (hour >= b.fromHour && hour <= b.toHour) return b.factor
  return RULES.demand.offPeakFactor
}
export const ruleById = (id: string): RuleDef => {
  const r = RULES.advisories.rules.find(x => x.id === id)
  if (!r) throw new Error('Unknown rule ' + id)
  return r
}
const ruleOfType = (type: AdvType): RuleDef => {
  const r = RULES.advisories.rules.find(x => x.type === type)
  if (!r) throw new Error('No rule for type ' + type)
  return r
}

// What the rules see at one airport at one moment.
export interface FieldInputs {
  code: string
  demand: number      // arrivals/hr after any active metering
  rawDemand: number   // arrivals/hr before metering (used for verification)
  cap: number         // weather-adjusted arrivals/hr
  vis: number         // metres
  storm: boolean; stormSev: number; stormDist: number; stormTops: number
  activeRunway: string; recRunway: string; lvpActive: boolean
  windDir: number | null; windKt: number
  tsReported: boolean; tsKind?: string   // live METAR: thunderstorm / CB at the field
  wxSource?: string                       // e.g. "METAR DNMM 1000Z" when weather is live
}
export interface RuleHit {
  ruleId: string; type: AdvType; sev: Severity; key: string; code: string
  title: string; body: string; payload?: { rec?: string }
  inputs: Record<string, InputValue>
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function evaluateFieldRules(f: FieldInputs): RuleHit[] {
  const hits: RuleHit[] = []

  const meter = ruleOfType('METER')
  if (f.demand > f.cap * meter.params.demandOverCapacityRatio) {
    hits.push({
      ruleId: meter.id, type: 'METER', key: 'METER' + f.code, code: f.code,
      sev: f.demand > f.cap * meter.params.warningRatio ? 'warning' : 'caution',
      title: `Flow metering — ${f.code}`,
      body: `Projected ${f.demand} arrivals/hr against ${f.cap}/hr weather-adjusted capacity. Consider ground holds or +2 min final spacing for ${Math.max(1, f.demand - f.cap)} aircraft.`,
      inputs: { demandPerHr: f.demand, capacityPerHr: f.cap, ratio: r2(f.demand / Math.max(1, f.cap)) },
    })
  }

  const cb = ruleOfType('CONVECTIVE')
  if (f.storm && f.stormSev >= cb.params.minCellSeverity) {
    hits.push({
      ruleId: cb.id, type: 'CONVECTIVE', key: 'CONV' + f.code, code: f.code, sev: cb.severity,
      title: `Convective cell — ${f.code}`,
      body: `CB activity ${Math.round(f.stormDist)} NM from the field, tops FL${f.stormTops}. Expect approach disruption; consider vectoring arrivals around the cell and reviewing alternate fuel.`,
      payload: {},
      inputs: { cbDistanceNm: Math.round(f.stormDist), cbTopsFl: f.stormTops, cellSeverity: f.stormSev },
    })
  }

  const rwy = ruleOfType('RUNWAY')
  if (f.recRunway !== f.activeRunway && f.windKt >= rwy.params.minWindKt) {
    hits.push({
      ruleId: rwy.id, type: 'RUNWAY', key: 'RWY' + f.code, code: f.code, sev: rwy.severity,
      title: `Runway change — ${f.code}`,
      body: `Surface wind ${f.windDir === null ? 'VRB' : Math.round(f.windDir) + '°'}/${Math.round(f.windKt)} kt favours RWY ${f.recRunway} (currently ${f.activeRunway}). Coordinate any change with the tower.`,
      payload: { rec: f.recRunway },
      inputs: { windDir: f.windDir === null ? 'VRB' : Math.round(f.windDir), windKt: Math.round(f.windKt), recommended: f.recRunway, active: f.activeRunway },
    })
  }

  const lvp = ruleOfType('LVP')
  if (f.vis < lvp.params.visibilityBelowM && !f.lvpActive) {
    hits.push({
      ruleId: lvp.id, type: 'LVP', key: 'LVP' + f.code, code: f.code, sev: lvp.severity,
      title: `Low visibility procedures — ${f.code}`,
      body: `Harmattan haze reduces visibility to ${f.vis} m. Consider activating LVP; expect reduced arrival rate and increased spacing.`,
      inputs: { visibilityM: f.vis },
    })
  }
  const tsr = ruleOfType('TSREP')
  if (f.tsReported) {
    hits.push({
      ruleId: tsr.id, type: 'TSREP', key: 'TSREP' + f.code, code: f.code, sev: tsr.severity,
      title: `Thunderstorm reported — ${f.code}`,
      body: 'The latest METAR reports thunderstorm or cumulonimbus at the field. Expect reduced arrival capacity and possible holding; review alternates and fuel.',
      inputs: { reported: f.tsKind ?? 'TS' },
    })
  }
  if (f.wxSource) for (const h of hits) h.inputs = { ...h.inputs, source: f.wxSource }
  return hits
}

// Verification: does the condition that raised an advisory still hold later?
// Deliberately ignores the effect of any action taken (metering, runway change,
// LVP) so a concurred advisory is judged on the situation, not on its own fix.
// This is a persistence check, not proof that the recommendation helped.
export function conditionHolds(ruleId: string, f: FieldInputs, adv: Pick<Advisory, 'payload'>): boolean {
  const rule = ruleById(ruleId)
  switch (rule.type) {
    case 'METER': return f.rawDemand > f.cap * rule.params.demandOverCapacityRatio
    case 'CONVECTIVE': return f.storm && f.stormSev >= rule.params.minCellSeverity
    case 'RUNWAY': return adv.payload?.rec === f.recRunway && f.windKt >= rule.params.minWindKt
    case 'LVP': return f.vis < rule.params.visibilityBelowM
    case 'TSREP': return f.tsReported
    default: return false
  }
}

export interface RuleScore {
  ruleId: string; name: string; raised: number; concurred: number; dismissed: number
  expired: number; pending: number; verified: number; stillValid: number
  reasons: Record<string, number>
}
export function buildScorecard(advs: Advisory[]): RuleScore[] {
  return RULES.advisories.rules.map(rule => {
    const mine = advs.filter(a => a.ruleId === rule.id)
    const verified = mine.filter(a => a.outcome !== undefined)
    return {
      ruleId: rule.id, name: rule.name, raised: mine.length,
      concurred: mine.filter(a => a.status === 'concurred').length,
      dismissed: mine.filter(a => a.status === 'dismissed').length,
      expired: mine.filter(a => a.status === 'expired').length,
      pending: mine.filter(a => a.status === 'pending').length,
      verified: verified.length,
      stillValid: verified.filter(a => a.outcome === 'still-valid').length,
      reasons: mine.reduce<Record<string, number>>((acc, a) => {
        if (a.status === 'dismissed' && a.dismissReason) acc[a.dismissReason] = (acc[a.dismissReason] ?? 0) + 1
        return acc
      }, {}),
    }
  })
}
