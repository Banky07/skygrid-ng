// Run with: node tests/recorder.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mergeRecords } from '../scripts/record-metar.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/metar-2026-11-13.json', import.meta.url), 'utf8'))
let n = 0
const ok = (name, fn) => { fn(); n++; console.log('  ok', name) }

ok('first run stores both reports, sorted by observation time', () => {
  const r = mergeRecords('', fixture, '2026-11-13T10:30:00Z')
  assert.equal(r.added, 2); assert.equal(r.total, 2)
  const rows = r.text.trim().split('\n').map(l => JSON.parse(l))
  assert.deepEqual(rows.map(x => x.icaoId), ['DNAA', 'DNMM'])        // 09:00Z before 10:00Z
  assert.equal(rows[0].seenAt, '2026-11-13T10:30:00Z')
})
ok('running again with the same reports adds nothing', () => {
  const first = mergeRecords('', fixture, '2026-11-13T10:30:00Z')
  const again = mergeRecords(first.text, fixture, '2026-11-13T11:00:00Z')
  assert.equal(again.added, 0); assert.equal(again.text, first.text)
})
ok('a new hourly report is appended and old rows keep their original seenAt', () => {
  const first = mergeRecords('', fixture, '2026-11-13T10:30:00Z')
  const next = { ...fixture[1], obsTime: fixture[1].obsTime + 3600, rawOb: 'METAR DNMM 131100Z 24005KT 9999 SCT014 31/24 Q1018 NOSIG' }
  const r = mergeRecords(first.text, [...fixture, next], '2026-11-13T11:20:00Z')
  assert.equal(r.added, 1); assert.equal(r.total, 3)
  const rows = r.text.trim().split('\n').map(l => JSON.parse(l))
  assert.equal(rows[rows.length - 1].obsTime, next.obsTime)
  assert.equal(rows.find(x => x.icaoId === 'DNAA').seenAt, '2026-11-13T10:30:00Z')
})
ok('a correction with the same time but different text is kept as a separate row', () => {
  const first = mergeRecords('', fixture, 't1')
  const cor = { ...fixture[1], rawOb: 'METAR COR DNMM 131000Z 25003KT 9999 SCT013 31/24 Q1018 NOSIG' }
  assert.equal(mergeRecords(first.text, [cor], 't2').added, 1)
})
ok('other stations and malformed records are ignored', () => {
  const junk = [{ icaoId: 'KJFK', obsTime: 1, rawOb: 'x' }, { icaoId: 'DNMM' }, { icaoId: 'DNMM', obsTime: 'x', rawOb: 'y' }]
  assert.equal(mergeRecords('', junk, 't').added, 0)
  assert.equal(mergeRecords('', { error: 'bad' }, 't').added, 0)
})
console.log(`\n${n} recorder checks passed`)
