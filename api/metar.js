// Vercel serverless function: proxies NOAA AviationWeather METARs for Lagos and Abuja only.
// Runs server-side so the browser never calls NOAA directly, and caches for 5 minutes
// so many viewers cause at most one upstream request per cache window.
const ALLOWED = new Set(['DNMM', 'DNAA'])

export default async function handler(req, res) {
  const ids = String((req.query && req.query.ids) || 'DNMM,DNAA')
    .split(',').map(s => s.trim().toUpperCase()).filter(s => ALLOWED.has(s))
  if (ids.length === 0) {
    res.status(400).json({ error: 'No allowed station ids' })
    return
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch('https://aviationweather.gov/api/data/metar?format=json&ids=' + ids.join(','), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'skygrid-ng research prototype' },
    })
    if (r.status === 204) {
      res.setHeader('Cache-Control', 's-maxage=60')
      res.status(200).json([])
      return
    }
    if (!r.ok) throw new Error('upstream ' + r.status)
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.status(200).json(data)
  } catch (e) {
    res.status(502).json({ error: 'METAR source unavailable' })
  } finally {
    clearTimeout(timer)
  }
}
