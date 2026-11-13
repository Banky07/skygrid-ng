// Records METARs for Lagos (DNMM) and Abuja (DNAA) from the NOAA AviationWeather API into a JSONL file.
// Each run fetches the last 3 hours (so a missed run or a SPECI is still caught) and appends only
// reports not already in the file. Usage: node scripts/record-metar.mjs <file.jsonl>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STATIONS = ['DNMM', 'DNAA']
const URL = `https://aviationweather.gov/api/data/metar?format=json&hours=3&ids=${STATIONS.join(',')}`

// Pure merge step (tested in tests/recorder.test.mjs). A correction (COR) has the same obsTime but
// different text, so the dedupe key includes the raw report.
export function mergeRecords(existingText, fetched, seenAt) {
  const rows = existingText.split('\n').filter(Boolean).map(l => JSON.parse(l))
  const have = new Set(rows.map(r => `${r.icaoId}|${r.obsTime}|${r.rawOb}`))
  let added = 0
  for (const rec of Array.isArray(fetched) ? fetched : []) {
    if (!STATIONS.includes(rec.icaoId) || typeof rec.obsTime !== 'number' || !rec.rawOb) continue
    const key = `${rec.icaoId}|${rec.obsTime}|${rec.rawOb}`
    if (have.has(key)) continue
    have.add(key); added++
    rows.push({ seenAt, ...rec })   // seenAt = when we first saw it; compare with receiptTime to measure lateness
  }
  rows.sort((a, b) => a.obsTime - b.obsTime || a.icaoId.localeCompare(b.icaoId))
  return { text: rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), added, total: rows.length }
}

async function main() {
  const file = process.argv[2]
  if (!file) { console.error('usage: node scripts/record-metar.mjs <file.jsonl>'); process.exit(2) }
  const r = await fetch(URL, { headers: { 'User-Agent': 'skygrid-ng recorder (research prototype)' }, signal: AbortSignal.timeout(30000) })
  if (r.status === 204) { console.log('no data returned'); return }
  if (!r.ok) throw new Error('upstream ' + r.status)
  const fetched = await r.json()
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const { text, added, total } = mergeRecords(existing, fetched, new Date().toISOString())
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  console.log(`added ${added}, total ${total}`)
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1) })
